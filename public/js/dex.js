/* globals $, history, location */

// @ts-ignore
window.initGallery = function (photoMap) {
  const $window = $(window)
  const $body = $(document.body)
  const $gallery = $('#gallery')
  const $closeButton = $('#close-button')

  let _currentSnap = null
  let currentFormMap = {}
  let snaps = Object.keys(photoMap).sort()

  const keysDown = {}
  let scrollTop
  let scrollDisabled = false

  $gallery.click(function (e) {
    if (e.target === this) {
      hideGallery()
    } else {
      showNextForm()
    }
  })

  $closeButton.click(function () {
    hideGallery()
  })

  // @ts-ignore
  $window.swiperight(function () {
    slideToPreviousSnap()
  }).swipeleft(function () {
    slideToNextSnap()
  }).keydown(function (e) {
    if (keysDown[e.keyCode]) {
      return
    }
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
      return
    }
    keysDown[e.keyCode] = true
    switch (e.keyCode) {
      case 37: // left arrow
        slideToPreviousSnap()
        break
      case 38: // up arrow
        showPreviousForm()
        break
      case 39: // right arrow
        slideToNextSnap()
        break
      case 40: // down arrow
        showNextForm()
        break
      case 27: // escape
        hideGallery()
        break
    }
  }).keyup(function (e) {
    keysDown[e.keyCode] = false
  }).hashchange(function () {
    var snap = getSnapFromHash()
    if (_currentSnap === snap) {
      return
    }
    if (snaps.indexOf(snap) !== -1) {
      showGalleryImage(snap)
    } else {
      hideGallery()
    }
  })

  // @ts-ignore
  // Trigger initial gallery image display.
  $window.hashchange()

  function showGalleryImage (number) {
    setCurrentSnap(number)
    setGalleryImage('current', _currentSnap)
    setGalleryImage('previous', getPreviousSnap())
    setGalleryImage('next', getNextSnap())
    disableScroll()
    $gallery.addClass('active')
  }

  function hideGallery () {
    setCurrentSnap(null)
    $('.gallery-image').attr('src', '')
    enableScroll()
    $gallery.removeClass('active')
    currentFormMap = {}
  }

  function slideToPreviousSnap () {
    if (!galleryActive()) {
      return
    }
    const previousSnap = getPreviousSnap()
    if (!previousSnap) {
      const current = $('.current')
      current.removeClass('current').addClass('next')
      setTimeout(function () {
        current.removeClass('next').addClass('current')
      }, 100)
      return
    }
    setCurrentSnap(previousSnap)
    $('.next').remove()
    $('.current').removeClass('current').addClass('next')
    $('.previous').removeClass('previous').addClass('current')
    $('<img class="gallery-image previous" draggable="false">').prependTo($gallery)
    setGalleryImage('previous', getPreviousSnap())
  }

  function slideToNextSnap () {
    if (!galleryActive()) {
      return
    }
    const nextSnap = getNextSnap()
    if (!nextSnap) {
      const current = $('.current')
      current.removeClass('current').addClass('previous')
      setTimeout(function () {
        current.removeClass('previous').addClass('current')
      }, 100)
      return
    }
    setCurrentSnap(nextSnap)
    $('.previous').remove()
    $('.current').removeClass('current').addClass('previous')
    $('.next').removeClass('next').addClass('current')
    $('<img class="gallery-image next" draggable="false">').prependTo($gallery)
    setGalleryImage('next', getNextSnap())
  }

  function showPreviousForm () {
    changeForm(-1)
  }

  function showNextForm () {
    changeForm(+1)
  }

  function changeForm (offset) {
    const currentForm = currentFormMap[_currentSnap] || 0
    setGalleryImage('current', _currentSnap, currentForm + offset)
    onFormChange()
  }

  function onFormChange () {
    const $current = $('.current')
    $current.addClass('form-change')
    setTimeout(() => $current.removeClass('form-change'), 100)
  }

  function galleryActive () {
    return $gallery.hasClass('active')
  }

  function getPreviousSnap () {
    const previousIndex = snaps.indexOf(_currentSnap) - 1
    return snaps[previousIndex]
  }

  function getNextSnap () {
    const nextIndex = snaps.indexOf(_currentSnap) + 1
    return snaps[nextIndex]
  }

  function setCurrentSnap (snap) {
    _currentSnap = snap
    if (snap) {
      history.replaceState(null, null, '#' + snap)
    } else {
      clearHash()
    }
  }

  function setGalleryImage (position, number, form) {
    if (number === undefined) {
      return
    }
    const forms = photoMap[number]
    const $galleryImage = $('.' + position + '.gallery-image')
    currentFormMap[number] = form !== undefined ? (form + forms.length) % forms.length : (currentFormMap[number] || 0)
    $galleryImage.attr('src', forms[currentFormMap[number]].galleryUrl)
    if (forms.length > 1) {
      $galleryImage.addClass('multiform')
    } else {
      $galleryImage.removeClass('multiform')
    }
  }

  function disableScroll () {
    if (scrollDisabled) {
      return
    }
    scrollTop = $window.scrollTop()
    $body.addClass('no-scroll').css({
      top: -scrollTop
    })
    scrollDisabled = true
  }

  function enableScroll () {
    if (!scrollDisabled) {
      return
    }
    $body.removeClass('no-scroll')
    $window.scrollTop(scrollTop)
    scrollDisabled = false
  }

  function getSnapFromHash () {
    return location.hash.replace(/^#/, '') || null
  }

  function clearHash () {
    if (!getSnapFromHash()) {
      return
    }
    history.replaceState(null, null, location.pathname)
    // @ts-ignore
    $window.hashchange()
  }
}
