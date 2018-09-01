/* globals $, history, location */

window.initGallery = function (photoMap) {
  const $window = $(window)
  const $body = $(document.body)
  const $gallery = $('#gallery')
  const $closeButton = $('#close-button')
  const $thumbnails = $('.thumbnail')

  let _currentSnap = null
  let snaps = Object.keys(photoMap).sort()

  const keysDown = {}
  let scrollTop
  let scrollDisabled = false

  $gallery.click(function (e) {
    if (e.target !== this) {
      return
    }
    hideGallery()
  })

  $closeButton.click(function () {
    hideGallery()
  })

  $thumbnails.click(function () {
    showGalleryImage($(this).data('number').toString())
  })

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
      case 39: // right arrow
        slideToNextSnap()
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

  function setGalleryImage (position, number) {
    if (number === undefined) {
      return
    }
    $('.' + position + '.gallery-image').attr('src', photoMap[number].galleryUrl)
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
    $window.hashchange()
  }
}
