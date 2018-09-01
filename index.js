const exphbs = require('express-handlebars')
const express = require('express')
const Flickr = require('flickrapi')

const handlebarsHelpers = require('./helpers/handlebars-helpers')
const GENERATIONS = require('./config/generations')
const UNOBTAINABLE = require('./config/unobtainable')

const app = express()

app.use(express.static('public'))

const hbs = exphbs.create({ defaultLayout: 'main', helpers: handlebarsHelpers })
app.engine('handlebars', hbs.engine)
app.set('view engine', 'handlebars')

const flickerOptions = {
  api_key: process.env.FLICKR_API_KEY,
  progress: false
}

app.get('/', (_, res) => {
  res.render('home', { subtitle: "Gotta snap 'em all!" })
})

const photodexPattern = new RegExp('phot[oó]dex', 'i')
app.get('/:trainer', (req, res) => {
  const { trainer } = req.params
  Flickr.tokenOnly(flickerOptions, (_, flickr) => {
    flickr.people.findByUsername({ username: trainer }, (_, result) => {
      const userId = result.user.nsid
      flickr.photosets.getList({ user_id: userId }, (_, result) => {
        const photodex = result.photosets.photoset.find(set => photodexPattern.test(set.title._content))
        flickr.photosets.getPhotos({ user_id: userId, photoset_id: photodex.id, extras: 'url_m,url_l' }, (_, result) => {
          const photoMap = getPhotoMap(result.photoset.photo)
          const generations = GENERATIONS.map(gen => withDexEntries(gen, photoMap))
          const snapCount = Object.keys(photoMap).length
          const subtitle = `Snapped: ${snapCount}`
          res.render('dex', { subtitle, generations, trainer, photoMap: JSON.stringify(photoMap) })
        })
      })
    })
  })
})

function getPhotoMap (photos) {
  const map = {}
  photos.forEach(photo => {
    const title = photo.title
    const match = title.match(/\d{3}/)
    if (match) {
      map[match[0]] = { title, thumbUrl: photo.url_m, galleryUrl: photo.url_l }
    }
  })
  return map
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

const port = process.env.PORT || 5000
app.listen(port, () => console.log(`Listening on port ${port}.`))
