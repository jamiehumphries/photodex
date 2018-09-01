exports.toLowerCase = function (value) {
  return value.toLowerCase()
}

exports.times = function (n, options) {
  let html = ''
  for (let i = 0; i < n; i++) {
    html += options.fn(this)
  }
  return html
}
