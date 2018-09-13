const express = require('express')
const basicAuth = require('express-basic-auth')
const exphbs = require('express-handlebars')
const enforce = require('express-sslify')
const Flickr = require('flickrapi')
const mcache = require('memory-cache')

const cache = require('./helpers/cache')
const handlebarsHelpers = require('./helpers/handlebars-helpers')
const GENERATIONS = require('./config/generations')
const UNOBTAINABLE = require('./config/unobtainable')

const app = express()

app.use(express.static('public'))

if (process.env.ENFORCE_HTTPS === 'yes') {
  app.use(enforce.HTTPS({ trustProtoHeader: true }))
}

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

app.get('/', cache(parseInt(process.env.HOME_RESPONSE_CACHE_SECONDS) || 1), async (req, res) => {
  const { username } = req.query
  if (username) {
    res.redirect(getTrainerUrl(username))
  } else {
    const exampleUsernames = (process.env.EXAMPLES || '').split(',')
    const examples = await getTrainerCards(exampleUsernames)
    res.render('home', { subtitle: "Gotta snap 'em all!", examples })
  }
})

app.get('/admin/dashboard', auth, async (req, res) => {
  const subtitle = 'Dashboard'
  const visited = await getTrainerCards(Array.from(recentlyVisited))
  res.render('dashboard', { subtitle, visited })
})

app.get('/:trainerName', cache(parseInt(process.env.TRAINER_RESPONSE_CACHE_SECONDS) || 1), async (req, res) => {
  let { trainerName } = req.params
  try {
    const flickr = await getFlickr()
    const { userId, username } = await findUser(flickr, trainerName)
    if (username !== trainerName) {
      res.redirect(getTrainerUrl(username))
      return
    }
    const { photosetId, photoMap, previewUrl } = await getPhotos(flickr, userId)
    const generations = GENERATIONS.map(gen => withDexEntries(gen, photoMap))
    const snapCount = Object.keys(photoMap).length
    const subtitle = `Snapped: ${snapCount}`
    const og = {
      title: `${username}'s Photódex`,
      url: 'https://www.photodex.io' + getTrainerUrl(username),
      image: previewUrl
    }
    updateRecentlyVisited(username)
    res.render('dex', { subtitle, userId, photosetId, username, og, generations, photoMap: JSON.stringify(photoMap) })
  } catch (error) {
    clearCaches(trainerName)
    const subtitle = '404: Not found!'
    notFound(res, { subtitle, username: trainerName, error: error.message })
  }
})

function getTrainerUrl (username) {
  return `/${encodeURIComponent(username)}`
}

function updateRecentlyVisited (username) {
  recentlyVisited.add(username)
}

function getTrainerCards (usernames) {
  return Promise.all(usernames.map(async username => {
    const flickr = await getFlickr()
    const { userId } = await findUser(flickr, username)
    const { photoMap, previewThumbUrl: preview } = await getPhotos(flickr, userId)
    const snapCount = Object.keys(photoMap).length
    return { username, preview, snapCount, url: getTrainerUrl(username) }
  }))
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
        const user = { userId, username }
        const cacheSeconds = parseInt(process.env.FIND_USER_CACHE_SECONDS) || 1
        mcache.put(cacheKey, user, cacheSeconds * 1000)
        resolve(user)
      }
    })
  })
}

function getFindUserCacheKey (username) {
  return `findUser__${username.toLowerCase()}`
}

async function getPhotos (flickr, userId) {
  const photosetId = await findPhotodexId(flickr, userId)
  const photoset = await getPhotoset(flickr, userId, photosetId)
  return { photosetId, ...mapPhotos(photoset.photo) }
}

const PHOTODEX_REGEX = new RegExp('phot[oó]dex', 'i')
function findPhotodexId (flickr, userId) {
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
          const id = photodex.id
          const cacheSeconds = parseInt(process.env.FIND_PHOTODEX_ID_CACHE_SECONDS) || 1
          mcache.put(cacheKey, id, cacheSeconds * 1000)
          resolve(id)
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

function getPhotoset (flickr, userId, photosetId) {
  return new Promise((resolve, reject) => {
    const params = { user_id: userId, photoset_id: photosetId, extras: 'url_m,url_l' }
    flickr.photosets.getPhotos(params, (error, result) => {
      if (error) {
        reject(error)
      } else {
        resolve(result.photoset)
      }
    })
  })
}

function mapPhotos (photos) {
  const photoMap = {}
  let previewUrl, previewThumbUrl
  photos.forEach(photo => {
    const title = photo.title
    const match = title.match(/\d{3}/)
    if (match) {
      const number = match[0]
      const { url_m: thumbUrl, url_l: galleryUrl, height_m: height, width_m: width } = photo
      const ratio = parseInt(width) / parseInt(height)
      const isLandscape = ratio > 1
      const orientation = isLandscape ? 'landscape' : 'portrait'
      const entry = { title, thumbUrl, galleryUrl: galleryUrl || thumbUrl, orientation }
      const positionMatch = title.match(/position=(top|bottom|left|right)/)
      if (positionMatch) {
        entry.position = positionMatch[1]
      } else if (isLandscape) {
        entry.thumbCss = `left: -${((ratio - 1) / 2) * 100}%;`
      }
      photoMap[number] = photoMap[number] || []
      photoMap[number].push(entry)
    }
    if (parseInt(photo.isprimary) === 1) {
      previewUrl = photo.url_l
      previewThumbUrl = photo.url_m
    }
  })
  if (photos.length > 0 && (!previewUrl || !previewThumbUrl)) {
    previewUrl = photos[0].url_l
    previewThumbUrl = photos[0].url_m
  }
  return { photoMap, previewUrl, previewThumbUrl }
}

function withDexEntries (generation, photoMap) {
  const { region, start, end } = generation
  const entries = []
  for (let i = start; i <= end; i++) {
    const number = padNumber(i)
    const unobtainable = UNOBTAINABLE.indexOf(i) !== -1
    const photos = photoMap[number]
    entries.push({ number, unobtainable, photos })
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
