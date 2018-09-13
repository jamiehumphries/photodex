/* globals $, history, location */

const ACTIVE = 'active'
const NO_SCROLL = 'no-scroll'
const GALLERY_IMAGE = 'gallery-image'
const PREVIOUS = 'previous'
const CURRENT = 'current'
const NEXT = 'next'
const MULTIFORM = 'multiform'
const FORM_CHANGING = 'form-changing'

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
      case 37: // Left arrow.
        slideToPreviousSnap()
        break
      case 38: // Up arrow.
        showPreviousForm()
        break
      case 39: // Right arrow.
        slideToNextSnap()
        break
      case 40: // Down arrow.
        showNextForm()
        break
      case 27: // Escape.
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
    setGalleryImage(CURRENT, _currentSnap)
    setGalleryImage(PREVIOUS, getPreviousSnap())
    setGalleryImage(NEXT, getNextSnap())
    disableScroll()
    $gallery.addClass(ACTIVE)
  }

  function hideGallery () {
    setCurrentSnap(null)
    $(`.${GALLERY_IMAGE}`).attr('src', '')
    enableScroll()
    $gallery.removeClass(ACTIVE)
    currentFormMap = {}
  }

  function slideToPreviousSnap () {
    slide(PREVIOUS, NEXT, getPreviousSnap)
  }

  function slideToNextSnap () {
    slide(NEXT, PREVIOUS, getNextSnap)
  }

  function slide (towards, awayFrom, getSnapInDirection) {
    if (!galleryActive()) {
      return
    }
    const snap = getSnapInDirection()
    if (!snap) {
      const current = $(`.${CURRENT}`)
      current.removeClass(CURRENT).addClass(awayFrom)
      setTimeout(function () {
        current.removeClass(awayFrom).addClass(CURRENT)
      }, 100)
      return
    }
    setCurrentSnap(snap)
    $(`.${awayFrom}`).remove()
    $(`.${CURRENT}`).removeClass(CURRENT).addClass(awayFrom)
    $(`.${towards}`).removeClass(towards).addClass(CURRENT)
    $(`<img class="${GALLERY_IMAGE} ${towards}" draggable="false">`).prependTo($gallery)
    setGalleryImage(towards, getSnapInDirection())
  }

  function showPreviousForm () {
    changeForm(-1)
  }

  function showNextForm () {
    changeForm(+1)
  }

  function changeForm (offset) {
    const currentForm = currentFormMap[_currentSnap] || 0
    setGalleryImage(CURRENT, _currentSnap, currentForm + offset)
    const $current = $(`.${CURRENT}`)
    $current.addClass(FORM_CHANGING)
    setTimeout(() => $current.removeClass(FORM_CHANGING), 100)
  }

  function galleryActive () {
    return $gallery.hasClass(ACTIVE)
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
      history.replaceState(null, null, `#${snap}`)
    } else {
      clearHash()
    }
  }

  function setGalleryImage (position, number, form) {
    if (number === undefined) {
      return
    }
    const forms = photoMap[number]
    const $galleryImage = $(`.${position}.${GALLERY_IMAGE}`)
    currentFormMap[number] = form !== undefined ? (form + forms.length) % forms.length : (currentFormMap[number] || 0)
    $galleryImage.attr('src', forms[currentFormMap[number]].galleryUrl)
    if (forms.length > 1) {
      $galleryImage.addClass(MULTIFORM)
    } else {
      $galleryImage.removeClass(MULTIFORM)
    }
  }

  function disableScroll () {
    if (scrollDisabled) {
      return
    }
    scrollTop = $window.scrollTop()
    $body.addClass(NO_SCROLL).css({
      top: -scrollTop
    })
    scrollDisabled = true
  }

  function enableScroll () {
    if (!scrollDisabled) {
      return
    }
    $body.removeClass(NO_SCROLL)
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
