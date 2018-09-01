const express = require('express')
const exphbs = require('express-handlebars')

const app = express()

app.use(express.static('public'))

const hbs = exphbs.create({ defaultLayout: 'main' })
app.engine('handlebars', hbs.engine)
app.set('view engine', 'handlebars')

app.get('/', (req, res) => {
  res.render('home', { name: 'JT Atomico' })
})

const port = process.env.PORT || 5000
app.listen(port, () => console.log(`Listening on port ${port}.`))
