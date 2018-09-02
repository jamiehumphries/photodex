const express = require('express')
const exphbs = require('express-handlebars')
const enforce = require('express-sslify')
const Flickr = require('flickrapi')

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

const flickrOptions = {
  api_key: process.env.FLICKR_API_KEY,
  progress: false
}

app.get('/', (req, res) => {
  const { username } = req.query
  if (username) {
    redirectToTrainer(res, username)
  } else {
    res.render('home', { subtitle: "Gotta snap 'em all!" })
  }
})

app.get('/:trainer', cache(process.env.CACHE_SECONDS), async (req, res) => {
  const { trainer } = req.params
  try {
    const flickr = await getFlickr()
    const { userId, username } = await findUser(flickr, trainer)
    if (username !== trainer) {
      redirectToTrainer(res, username)
      return
    }
    const photosetId = await findPhotodexId(flickr, userId)
    const photoset = await getPhotoset(flickr, userId, photosetId)
    const { photoMap, preview } = getPhotoMapAndPreview(photoset.photo)
    const generations = GENERATIONS.map(gen => withDexEntries(gen, photoMap))
    const snapCount = Object.keys(photoMap).length
    const subtitle = `Snapped: ${snapCount}`
    res.render('dex', { subtitle, username, preview, generations, photoMap: JSON.stringify(photoMap) })
  } catch (error) {
    clearCaches(trainer)
    const subtitle = '404: Not found!'
    notFound(res, { subtitle, username: trainer, error: error.message })
  }
})

function redirectToTrainer (res, trainer) {
  res.redirect(`/${encodeURIComponent(trainer)}`)
}

function getFlickr () {
  return new Promise((resolve, reject) => {
    Flickr.tokenOnly(flickrOptions, (error, flickr) => {
      if (error) {
        reject(error)
      } else {
        resolve(flickr)
      }
    })
  })
}

const findUserCache = {}
function findUser (flickr, username) {
  const cacheKey = username.toLowerCase()
  const cached = findUserCache[cacheKey]
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
        resolve(findUserCache[cacheKey] = { userId, username })
      }
    })
  })
}

const PHOTODEX_REGEX = new RegExp('phot[oó]dex', 'i')
const findPhotodexCache = {}
function findPhotodexId (flickr, userId) {
  const cacheKey = userId
  const cached = findPhotodexCache[cacheKey]
  if (cached) {
    return Promise.resolve(cached)
  }
  return new Promise((resolve, reject) => {
    flickr.photosets.getList({ user_id: userId }, (error, result) => {
      if (error) {
        reject(error)
      } else {
        const photosets = result.photosets.photoset
        const photodex = photosets.find(set => PHOTODEX_REGEX.test(set.title._content))
        if (photodex) {
          resolve(findPhotodexCache[cacheKey] = photodex.id)
        } else {
          reject(new Error("No public album found with 'Photódex' in the title"))
        }
      }
    })
  })
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

function getPhotoMapAndPreview (photos) {
  const photoMap = {}
  let preview = null
  photos.forEach(photo => {
    const title = photo.title
    const match = title.match(/\d{3}/)
    if (match) {
      const { url_m: thumbUrl, url_l: galleryUrl, height_m: height, width_m: width } = photo
      const ratio = parseInt(width) / parseInt(height)
      const isLandscape = ratio > 1
      const orientation = isLandscape ? 'landscape' : 'portrait'
      const result = { title, thumbUrl, galleryUrl, orientation }
      if (isLandscape) {
        result.thumbCss = `left: -${((ratio - 1) / 2) * 100}%;`
      }
      photoMap[match[0]] = result
    }
    if (parseInt(photo.isprimary) === 1) {
      preview = photo.url_l
    }
  })
  return { photoMap, preview }
}

function withDexEntries (generation, photoMap) {
  const { region, start, end } = generation
  const entries = []
  for (let i = start; i <= end; i++) {
    const number = padNumber(i)
    const unobtainable = UNOBTAINABLE.indexOf(i) !== -1
    const photo = photoMap[number]
    entries.push({ number, unobtainable, photo })
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

function clearCaches (trainer) {
  const userId = findUserCache[trainer]
  delete findUserCache[trainer]
  if (userId) {
    delete findPhotodexCache[userId]
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
