const express = require('express')
const basicAuth = require('express-basic-auth')
const exphbs = require('express-handlebars')
const Flickr = require('flickrapi')
const mcache = require('memory-cache')

const cache = require('./helpers/cache')
const handlebarsHelpers = require('./helpers/handlebars-helpers')
const GENERATIONS = require('./config/generations')

const BASE_URL = 'http://www.photodex.io'

const PHOTODEX_REGEX = new RegExp('phot[oó]dex', 'i')
const FLICKR_PER_PAGE = 500

const HOME_RESPONSE_CACHE_SECONDS = parseInt(process.env.HOME_RESPONSE_CACHE_SECONDS) || 1
const DEX_RESPONSE_CACHE_SECONDS = parseInt(process.env.DEX_RESPONSE_CACHE_SECONDS) || 1
const FIND_PHOTODEX_ID_CACHE_SECONDS = parseInt(process.env.FIND_PHOTODEX_ID_CACHE_SECONDS) || 1
const FIND_USER_CACHE_SECONDS = parseInt(process.env.FIND_USER_CACHE_SECONDS) || 1

const app = express()

app.use(express.static('public'))

const hbs = exphbs.create({ defaultLayout: 'main', helpers: handlebarsHelpers })
app.engine('handlebars', hbs.engine)
app.set('view engine', 'handlebars')

const users = {}
const adminPassword = process.env.ADMIN_PASSWORD
if (adminPassword) {
  users['admin'] = adminPassword
}
const auth = basicAuth({ users, challenge: true })

const flickrOptions = {
  api_key: process.env.FLICKR_API_KEY,
  progress: false
}

const recentlyVisited = new Set()
let _flickr = null

app.get('/', cache(HOME_RESPONSE_CACHE_SECONDS), async (req, res) => {
  const { username, redirected } = req.query
  if (username) {
    res.redirect(getDexUrl(username))
  } else {
    const featuredUsernames = (process.env.FEATURED || '').split(',')
    const featured = await getTrainerCards(featuredUsernames)
    const showAnnouncement = redirected === 'true'
    res.render('home', { subtitle: "Gotta snap 'em all!", featured, showAnnouncement })
  }
})

app.get('/admin/dashboard', auth, async (req, res) => {
  const subtitle = 'Dashboard'
  const visited = await getTrainerCards(Array.from(recentlyVisited))
  res.render('dashboard', { subtitle, visited })
})

app.get('/:username', cache(DEX_RESPONSE_CACHE_SECONDS), async (req, res) => {
  let { username } = req.params
  try {
    const flickr = await getFlickr()
    const user = await findUser(flickr, username)
    if (user.username !== username) {
      res.redirect(getDexUrl(user.username))
      return
    }
    const { photosetId, photoMap, previewUrl, trainerOverride } = await getPhotos(flickr, user.userId, true)
    const snapCount = Object.keys(photoMap).length
    const subtitle = `Snapped: ${snapCount}`
    const trainer = trainerOverride || username
    const flickrUrl = getFlickrUrl(user.userId, photosetId)
    const og = {
      title: `${trainer}'s Photódex`,
      url: BASE_URL + getDexUrl(username),
      image: previewUrl
    }
    const generations = GENERATIONS.map(gen => withDexEntries(gen, photoMap)).filter(gen => gen.entries.length > 0)
    updateRecentlyVisited(username)
    Object.keys(photoMap).forEach(key => {
      photoMap[key] = photoMap[key].map(photo => { return { galleryUrl: photo.galleryUrl } })
    })
    res.render('dex', { subtitle, trainer, og, flickrUrl, generations, photoMap: JSON.stringify(photoMap) })
  } catch (error) {
    clearCaches(username)
    const subtitle = '404: Not found!'
    notFound(res, { subtitle, trainer: username, error: error.message })
  }
})

app.get('/api/trainer/:username', cache(DEX_RESPONSE_CACHE_SECONDS), async (req, res) => {
  try {
    const flickr = await getFlickr()
    const { userId, username } = await findUser(flickr, req.params.username)
    const { photosetId, photoMap: photos, previewUrl, previewThumbUrl } = await getPhotos(flickr, userId, false)
    const photodexUrl = BASE_URL + getDexUrl(username)
    const flickrUrl = getFlickrUrl(userId, photosetId)
    const count = Object.keys(photos).length
    res.json({ username, photodexUrl, userId, photosetId, flickrUrl, previewUrl, previewThumbUrl, count, photos })
  } catch (error) {
    res.sendStatus(404)
  }
})

function getDexUrl (username) {
  return `/${encodeURIComponent(username)}`
}

function getFlickrUrl (userId, photosetId) {
  return `https://www.flickr.com/photos/${userId}/sets/${photosetId}`
}

function updateRecentlyVisited (username) {
  recentlyVisited.add(username)
}

async function getTrainerCards (usernames) {
  const cards = await Promise.all(usernames.map(async username => {
    try {
      const flickr = await getFlickr()
      const { userId } = await findUser(flickr, username)
      const { photoMap, previewThumbUrl: preview, trainerOverride } = await getPhotos(flickr, userId, false)
      const snapCount = Object.keys(photoMap).length
      const trainer = trainerOverride || username
      return { trainer, preview, snapCount, url: getDexUrl(username) }
    } catch (e) {
      return null
    }
  }))
  return cards.filter(card => card !== null)
}

function getFlickr () {
  if (_flickr) {
    return Promise.resolve(_flickr)
  }
  return new Promise((resolve, reject) => {
    Flickr.tokenOnly(flickrOptions, (error, flickr) => {
      if (error) {
        reject(error)
      } else {
        _flickr = flickr
        resolve(flickr)
      }
    })
  })
}

function findUser (flickr, username) {
  const cacheKey = getFindUserCacheKey(username)
  const cached = mcache.get(cacheKey)
  if (cached) {
    return Promise.resolve(cached)
  }
  return new Promise((resolve, reject) => {
    flickr.people.findByUsername({ username }, (error, result) => {
      if (error) {
        reject(error)
      } else {
        const userId = result.user.nsid
        const username = result.user.username._content
        const response = { userId, username }
        mcache.put(cacheKey, response, FIND_USER_CACHE_SECONDS * 1000)
        resolve(response)
      }
    })
  })
}

function getFindUserCacheKey (username) {
  return `findUser__${username.toLowerCase()}`
}

async function getPhotos (flickr, userId, includeDisplayMetadata) {
  const { photosetId, total, trainerOverride } = await findPhotodex(flickr, userId)
  const numberOfPages = Math.ceil(total / FLICKR_PER_PAGE)
  const pages = await Promise.all([...Array(numberOfPages).keys()].map(i => {
    // Flickr API pages are 1-indexed.
    const page = i + 1
    return getPhotoset(flickr, userId, photosetId, page)
  }))
  const photos = pages.reduce((all, page) => all.concat(page.photo), [])
  return { photosetId, trainerOverride, ...mapPhotos(photos, includeDisplayMetadata) }
}

function findPhotodex (flickr, userId) {
  const cacheKey = getFindPhotodexIdCacheKey(userId)
  const cached = mcache.get(cacheKey)
  if (cached) {
    return Promise.resolve(cached)
  }
  return new Promise((resolve, reject) => {
    flickr.photosets.getList({ user_id: userId }, (error, result) => {
      if (error) {
        reject(error)
      } else {
        const photosets = result.photosets.photoset
        const photodex = photosets.find(photoset => PHOTODEX_REGEX.test(photoset.title._content))
        if (photodex) {
          const photosetId = photodex.id
          const total = parseInt(photodex.photos)
          const response = { photosetId, total }
          const description = photodex.description._content
          const trainerMatch = description.match(/trainer=(\w+)/)
          if (trainerMatch) {
            response.trainerOverride = trainerMatch[1]
          }
          mcache.put(cacheKey, response, FIND_PHOTODEX_ID_CACHE_SECONDS * 1000)
          resolve(response)
        } else {
          reject(new Error("No public album found with 'Photódex' in the title"))
        }
      }
    })
  })
}

function getFindPhotodexIdCacheKey (userId) {
  return `findPhotodexId__${userId}`
}

function getPhotoset (flickr, userId, photosetId, page) {
  return new Promise((resolve, reject) => {
    const params = {
      user_id: userId,
      photoset_id: photosetId,
      extras: 'url_m,url_l',
      per_page: FLICKR_PER_PAGE,
      page
    }
    flickr.photosets.getPhotos(params, (error, result) => {
      if (error) {
        reject(error)
      } else {
        resolve(result.photoset)
      }
    })
  })
}

function mapPhotos (photos, includeDisplayMetadata) {
  const photoMap = {}
  let primaryPhoto
  photos.forEach(photo => {
    const title = photo.title
    const match = title.match(/\d{3}/)
    if (match) {
      const number = match[0]
      if (!isValidNumber(number)) {
        return
      }
      const { url_m: thumbUrl, url_l: galleryUrl, height_m: height, width_m: width } = photo
      const entry = { thumbUrl, galleryUrl: galleryUrl || thumbUrl }
      if (includeDisplayMetadata) {
        entry.title = title
        const ratio = parseInt(width) / parseInt(height)
        const isLandscape = ratio > 1
        entry.orientation = isLandscape ? 'landscape' : 'portrait'
        const positionMatch = title.match(/position=(top|bottom|left|right)/)
        const arrowMatch = title.match(/(↑|↓|←|→)/)
        if (positionMatch) {
          entry.position = positionMatch[1]
        } else if (arrowMatch) {
          const arrowPositions = { '↑': 'top', '↓': 'bottom', '←': 'left', '→': 'right' }
          const arrow = arrowMatch[1]
          entry.position = arrowPositions[arrow]
        } else if (isLandscape) {
          entry.thumbCss = `left: -${((ratio - 1) / 2) * 100}%;`
        }
      }
      photoMap[number] = photoMap[number] || []
      photoMap[number].push(entry)
    }
    if (parseInt(photo.isprimary) === 1) {
      primaryPhoto = photo
    }
  })
  if (!primaryPhoto) {
    primaryPhoto = photos[0]
  }
  const previewUrl = primaryPhoto.url_l || primaryPhoto.url_m
  const previewThumbUrl = primaryPhoto.url_m
  return { photoMap, previewUrl, previewThumbUrl }
}

function isValidNumber (number) {
  number = parseInt(number)
  return GENERATIONS.find(gen => gen.start <= number && number <= gen.end) !== undefined
}

function withDexEntries (generation, photoMap) {
  const { region, start, end } = generation
  const entries = []
  for (let i = start; i <= end; i++) {
    const number = padNumber(i)
    const photos = photoMap[number] || []
    entries.push({ number, photos })
  }
  while (entries.length > 0 && entries[entries.length - 1].photos.length === 0) {
    entries.pop()
  }
  return { region, entries }
}

function padNumber (n) {
  let number = n.toString()
  while (number.length < 3) {
    number = '0' + number
  }
  return number
}

function clearCaches (username) {
  const findUserCacheKey = getFindUserCacheKey(username)
  const user = mcache.get(findUserCacheKey)
  mcache.del(findUserCacheKey)
  if (user) {
    const findPhotodexIdCacheKey = getFindPhotodexIdCacheKey(user.userId)
    mcache.del(findPhotodexIdCacheKey)
  }
}

app.use((req, res, next) => {
  notFound(res)
})

function notFound (res, context) {
  const subtitle = '404: Not found!'
  const error = 'No page exists at the requested route'
  res.status(404).render('error', Object.assign({ subtitle, error }, context))
}

app.use((err, req, res, next) => {
  console.error(err.stack)
  const subtitle = '500: Server error!'
  const error = 'An unexpected error has occurred'
  res.status(500).render('error', { subtitle, error })
})

const port = process.env.PORT || 5000
app.listen(port, () => console.log(`Listening on port ${port}.`))
