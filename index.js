const express = require('express')
const exphbs = require('express-handlebars')
const handlebarsHelpers = require('./helpers/handlebars-helpers')
const GENERATIONS = require('./config/generations')
const UNOBTAINABLE = require('./config/unobtainable')

const app = express()

app.use(express.static('public'))

const hbs = exphbs.create({ defaultLayout: 'main', helpers: handlebarsHelpers })
app.engine('handlebars', hbs.engine)
app.set('view engine', 'handlebars')

app.get('/', (_, res) => {
  res.render('home', { subtitle: "Gotta snap 'em all!" })
})

app.get('/:trainer', (req, res) => {
  const { trainer } = req.params
  const generations = GENERATIONS.map(withEntries)
  const subtitle = 'Snapped: 0'
  res.render('dex', { subtitle, generations, trainer })
})

function withEntries (generation) {
  const { region, start, end } = generation
  const entries = []
  for (let i = start; i <= end; i++) {
    const number = padNumber(i)
    const unobtainable = UNOBTAINABLE.indexOf(i) !== -1
    entries.push({ number, unobtainable })
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
