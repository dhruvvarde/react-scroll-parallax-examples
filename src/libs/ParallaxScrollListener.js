import {
    scaleBetween,
    testForPassiveScroll,
    parseValueAndUnit,
} from '../utils/index';

(function(window, document) {
    
    function ParallaxScrollListener() {

        // All parallax elements to be updated
        const elements = [];

        // Tracks current scroll y distance
        let scrollY = 0;

        // ID to increment for elements
        let id = 0;

        // Ticking
        let ticking = false;

        // Scroll direction
        let scrollDown = null;

        // Passive support
        const supportsPassive = testForPassiveScroll();

        function _removeListeners() {
            window.removeEventListener('scroll', _handleScroll, supportsPassive ? { passive: true } : false);
            window.removeEventListener('resize', _handleResize, false);
        }

        function _addListeners() {
            window.addEventListener('scroll', _handleScroll, supportsPassive ? { passive: true } : false);
            window.addEventListener('resize', _handleResize, false);
        }

        /**
         * Window scroll handler
         * sets the scrollY and then calls updateElementPositions()
         */
        function _handleScroll() {
            // reference to prev scroll y
            const prevScrollY = scrollY;

            // Save current scroll
            scrollY = window.scrollY;

            // direction
            scrollDown = scrollY > prevScrollY;

            // Only called if the last animation request has been
            // completed and there are parallax elements to update
            if (!ticking && elements.length > 0) {
                ticking = true;
                window.requestAnimationFrame(_updateElementPositions);
            }
        }

        /**
         * Window resize handler
         * calls update() which update parallax element attributes and positions
         */
        function _handleResize() {
            _updateElementAttributes();
            _updateElementPositions();
        }

        /**
         * Creates a unique ID
         */
        function _createID() {
            ++id;
            return id;
        }

        function _updateElementPositions() {
            elements.forEach(element => {
                if (element.props.disabled) return;

                // check if the element is in view then
                const isInView = _isElementInView(element);

                // set styles if it is
                if (isInView) _setParallaxStyles(element);

                // reset ticking so more animations can be called
                ticking = false;
            });
        }

        function _updateElementAttributes() {
            elements.forEach(element => {
                if (element.props.disabled) return;

                _setupOffsets(element);

                _cacheAttributes(element);
            });
        }

        function _removeParallaxStyles() {
            elements.forEach(element => {
                _resetStyles(element);
            });
        }

        /**
         * Takes a parallax element and caches important values
         * as an attribute object on the element
         *
         * @param {object} element
         */
        function _cacheAttributes(element) {
            const {
                yMin,
                yMax,
                xMax,
                xMin,
            } = element.offsets;

            const { slowerScrollRate } = element.props;

            // NOTE: Many of these cause layout and reflow so don't
            // do this on every frame, instead the values are cached
            // to access later
            const el = element._outer;
            const rect = el.getBoundingClientRect();
            const html = document.documentElement;
            const windowHeight = window.innerHeight || html.clientHeight;
            const elHeight = el.offsetHeight;
            const elWidth = el.offsetWidth;
            const scrollY = window.scrollY;

            // NOTE: offsetYMax and offsetYMin are percents
            // based of the height of the element. They must be
            // calculated as px to correctly determine whether
            // the element is in the viewport.
            const yPercent = yMax.unit === '%' || yMin.unit === '%';
            const xPercent = xMax.unit === '%' || xMin.unit === '%';

            const h100 = elHeight / 100;
            const yMaxPx = yPercent ? (yMax.value * h100) : yMax.value;
            const yMinPx = yPercent ? (yMin.value * h100) : yMin.value; // negative value

            const w100 = elWidth / 100;
            const xMaxPx = xPercent ? (xMax.value * w100) : xMax.value;
            const xMinPx = xPercent ? (xMin.value * w100) : xMin.value; // negative value

            // NOTE: must add the current scroll position when the
            // element is checked so that we get its absolute position
            // relative to the document and not the viewport then
            // add the min/max offsets calculated above
            const top = rect.top + scrollY + (slowerScrollRate ? yMinPx : yMaxPx * -1);
            const bottom = rect.bottom + scrollY + (slowerScrollRate ? yMaxPx : yMinPx * -1);

            // Total distance the element will move from when
            // the top enters the view to the bottom leaving
            // accounting for elements height and max/min offsets
            const totalDist = windowHeight + (elHeight + Math.abs(yMinPx) + yMaxPx);

            element.attributes = {
                top,
                bottom,
                elHeight,
                elWidth,
                yMaxPx,
                yMinPx,
                xMaxPx,
                xMinPx,
                totalDist,
                windowHeight,
            };
        }

        /**
         * Takes a parallax element and parses the offset props
         * to get the value and unit (if any). Sets these offsets
         * on the element
         *
         * @param {object} element
         */
        function _setupOffsets(element) {
            const {
                offsetYMin,
                offsetYMax,
                offsetXMax,
                offsetXMin,
            } = element.props;

            const yMin = parseValueAndUnit(offsetYMin);
            const yMax = parseValueAndUnit(offsetYMax);
            const xMin = parseValueAndUnit(offsetXMax);
            const xMax = parseValueAndUnit(offsetXMin);

            // @TODO: Move error to component proptypes
            if (xMin.unit !== xMax.unit || yMin.unit !== yMax.unit) {
                throw new Error('Must provide matching units for the min and max offset values of each axis.');
            }

            const xUnit = xMin.unit || '%';
            const yUnit = yMin.unit || '%';

            element.offsets = {
                xUnit,
                yUnit,
                yMin,
                yMax,
                xMin,
                xMax,
            };
        }

        function _isElementInView(element) {
            const { windowHeight } = element.attributes;
            const top = element.attributes.top - scrollY;
            const bottom = element.attributes.bottom - scrollY;

            const topInView     = top    >= 0 && top    <= windowHeight;
            const bottomInView  = bottom >= 0 && bottom <= windowHeight;
            const covering      = top    <= 0 && bottom >= windowHeight;

            const isInView = topInView || bottomInView || covering;
            // console.log('top', topInView, 'bottom', bottomInView, 'covering', covering);

            return isInView;
        }

        function _setParallaxStyles(element) {
            const top = element.attributes.top - scrollY;
            const {
                windowHeight,
                totalDist,
            } = element.attributes;

            // Percent the element has moved based on current and total distance to move
            const percentMoved = (top * -1 + windowHeight) / totalDist * 100;

            // Scale percentMoved to min/max percent determined by offset props
            const { slowerScrollRate } = element.props;
            const {
                xUnit,
                yUnit,
                yMin,
                yMax,
                xMin,
                xMax,
            } = element.offsets;

            // sets parallax to faster or slower than the rate of scroll
            let x = 0;
            let y = 0;

            if (slowerScrollRate) {
                x = scaleBetween(percentMoved, xMin.value, xMax.value, 0, 100);
                y = scaleBetween(percentMoved, yMin.value, yMax.value, 0, 100);
            } else {
                // flipped max/min
                x = scaleBetween(percentMoved, xMax.value, xMin.value, 0, 100);
                y = scaleBetween(percentMoved, yMax.value, yMin.value, 0, 100);
            }

            // Apply styles
            const el = element._inner;
            el.style.cssText =
               `will-change:transform;
                position:relative;
                transform:translate3d(${x}${xUnit}, ${y}${yUnit}, 0)`;
        }

        function _resetStyles(element) {
            // Resets any styles that may be left over when
            // resizing from desktop to mobile apply styles
            const el = element._inner;
            el.style.cssText =
               `will-change:none;
                position:relative;
                transform:translate3d(0, 0, 0)`;
        }

        /**
         * --------------------------------------
         * Public methods
         * --------------------------------------
         */

        this.createElement = function(options) {
            const id = _createID();
            const element = {
                id,
                ...options
            };

            elements.push(element);
            this.update();

            return element;
        };

        this.removeElement = function(element) {
            // console.log('remove element')
            const index = elements.indexOf(element);
            if (index !== -1) {
                elements.splice(index, 1);
            }
        };

        this.updateElement = function(id, options) {
            // console.log('update element')
            // update props of a given element
            const index = elements.findIndex(el => el.id === id);

            // create new element with options
            const element = Object.assign({}, elements[index], options);

            // replace old
            elements[index] = element;

            this.update();
        };

        /**
         * Updates all parallax element attributes and postitions
         */
        this.update = function() {
            _updateElementAttributes();
            _updateElementPositions();
        };

        /**
         * Removes listeners, resets all styles, nullifies self
         */
        this.reset = function() {
            _removeParallaxStyles();
        };

        /**
         * Removes listeners, resets all styles, nullifies self
         */
        this.destroy = function() {
            _removeListeners();
            _removeParallaxStyles();
            window.ParallaxScrollListener = null;
        };

        // Initialize the Parallax scroll listener
        _addListeners();

    }

    window.ParallaxScrollListener = new ParallaxScrollListener();

})(window, document);

