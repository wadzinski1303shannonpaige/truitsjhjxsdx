/*******************************************************************************
 * Copyright 2019 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/

/**
 * Element.matches()
 * https://developer.mozilla.org/enUS/docs/Web/API/Element/matches#Polyfill
 */
if (!Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
}

// eslint-disable-next-line valid-jsdoc
/**
 * Element.closest()
 * https://developer.mozilla.org/enUS/docs/Web/API/Element/closest#Polyfill
 */
if (!Element.prototype.closest) {
    Element.prototype.closest = function(s) {
        "use strict";
        var el = this;
        if (!document.documentElement.contains(el)) {
            return null;
        }
        do {
            if (el.matches(s)) {
                return el;
            }
            el = el.parentElement || el.parentNode;
        } while (el !== null && el.nodeType === 1);
        return null;
    };
}

/*******************************************************************************
 * Copyright 2019 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function() {
    "use strict";

    var containerUtils = window.CQ && window.CQ.CoreComponents && window.CQ.CoreComponents.container && window.CQ.CoreComponents.container.utils ? window.CQ.CoreComponents.container.utils : undefined;
    if (!containerUtils) {
        // eslint-disable-next-line no-console
        console.warn("Accordion: container utilities at window.CQ.CoreComponents.container.utils are not available. This can lead to missing features. Ensure the core.wcm.components.commons.site.container client library is included on the page.");
    }
    var dataLayerEnabled;
    var dataLayer;
    var delay = 100;

    var NS = "cmp";
    var IS = "accordion";

    var keyCodes = {
        ENTER: 13,
        SPACE: 32,
        END: 35,
        HOME: 36,
        ARROW_LEFT: 37,
        ARROW_UP: 38,
        ARROW_RIGHT: 39,
        ARROW_DOWN: 40
    };

    var selectors = {
        self: "[data-" + NS + '-is="' + IS + '"]'
    };

    var cssClasses = {
        button: {
            disabled: "cmp-accordion__button--disabled",
            expanded: "cmp-accordion__button--expanded"
        },
        panel: {
            hidden: "cmp-accordion__panel--hidden",
            expanded: "cmp-accordion__panel--expanded"
        }
    };

    var dataAttributes = {
        item: {
            expanded: "data-cmp-expanded"
        }
    };

    var properties = {
        /**
         * Determines whether a single accordion item is forced to be expanded at a time.
         * Expanding one item will collapse all others.
         *
         * @memberof Accordion
         * @type {Boolean}
         * @default false
         */
        "singleExpansion": {
            "default": false,
            "transform": function(value) {
                return !(value === null || typeof value === "undefined");
            }
        }
    };

    /**
     * Accordion Configuration.
     *
     * @typedef {Object} AccordionConfig Represents an Accordion configuration
     * @property {HTMLElement} element The HTMLElement representing the Accordion
     * @property {Object} options The Accordion options
     */

    /**
     * Accordion.
     *
     * @class Accordion
     * @classdesc An interactive Accordion component for toggling panels of related content
     * @param {AccordionConfig} config The Accordion configuration
     */
    function Accordion(config) {
        var that = this;

        if (config && config.element) {
            init(config);
        }

        /**
         * Initializes the Accordion.
         *
         * @private
         * @param {AccordionConfig} config The Accordion configuration
         */
        function init(config) {
            that._config = config;

            // prevents multiple initialization
            config.element.removeAttribute("data-" + NS + "-is");

            setupProperties(config.options);
            cacheElements(config.element);

            if (that._elements["item"]) {
                // ensures multiple element types are arrays.
                that._elements["item"] = Array.isArray(that._elements["item"]) ? that._elements["item"] : [that._elements["item"]];
                that._elements["button"] = Array.isArray(that._elements["button"]) ? that._elements["button"] : [that._elements["button"]];
                that._elements["panel"] = Array.isArray(that._elements["panel"]) ? that._elements["panel"] : [that._elements["panel"]];

                if (that._properties.singleExpansion) {
                    var expandedItems = getExpandedItems();
                    // multiple expanded items annotated, display the last item open.
                    if (expandedItems.length > 1) {
                        toggle(expandedItems.length - 1);
                    }
                }

                refreshItems();
                bindEvents();
                scrollToDeepLinkIdInAccordion();
            }
            if (window.Granite && window.Granite.author && window.Granite.author.MessageChannel) {
                /*
                 * Editor message handling:
                 * - subscribe to "cmp.panelcontainer" message requests sent by the editor frame
                 * - check that the message data panel container type is correct and that the id (path) matches this specific Accordion component
                 * - if so, route the "navigate" operation to enact a navigation of the Accordion based on index data
                 */
                window.CQ.CoreComponents.MESSAGE_CHANNEL = window.CQ.CoreComponents.MESSAGE_CHANNEL || new window.Granite.author.MessageChannel("cqauthor", window);
                window.CQ.CoreComponents.MESSAGE_CHANNEL.subscribeRequestMessage("cmp.panelcontainer", function(message) {
                    if (message.data && message.data.type === "cmp-accordion" && message.data.id === that._elements.self.dataset["cmpPanelcontainerId"]) {
                        if (message.data.operation === "navigate") {
                            // switch to single expansion mode when navigating in edit mode.
                            var singleExpansion = that._properties.singleExpansion;
                            that._properties.singleExpansion = true;
                            toggle(message.data.index);

                            // revert to the configured state.
                            that._properties.singleExpansion = singleExpansion;
                        }
                    }
                });
            }
        }

        /**
         * Displays the panel containing the element that corresponds to the deep link in the URI fragment
         * and scrolls the browser to this element.
         */
        function scrollToDeepLinkIdInAccordion() {
            if (containerUtils) {
                var deepLinkItemIdx = containerUtils.getDeepLinkItemIdx(that, "item", "item");
                if (deepLinkItemIdx > -1) {
                    var deepLinkItem = that._elements["item"][deepLinkItemIdx];
                    if (deepLinkItem && !deepLinkItem.hasAttribute(dataAttributes.item.expanded)) {
                        // if single expansion: close all accordion items
                        if (that._properties.singleExpansion) {
                            for (var j = 0; j < that._elements["item"].length; j++) {
                                if (that._elements["item"][j].hasAttribute(dataAttributes.item.expanded)) {
                                    setItemExpanded(that._elements["item"][j], false, true);
                                }
                            }
                        }
                        // expand the accordion item containing the deep link
                        setItemExpanded(deepLinkItem, true, true);
                    }
                    var hashId = window.location.hash.substring(1);
                    if (hashId) {
                        var hashItem = document.querySelector("[id='" + hashId + "']");
                        if (hashItem) {
                            hashItem.scrollIntoView();
                        }
                    }
                }
            }
        }

        /**
         * Caches the Accordion elements as defined via the {@code data-accordion-hook="ELEMENT_NAME"} markup API.
         *
         * @private
         * @param {HTMLElement} wrapper The Accordion wrapper element
         */
        function cacheElements(wrapper) {
            that._elements = {};
            that._elements.self = wrapper;
            var hooks = that._elements.self.querySelectorAll("[data-" + NS + "-hook-" + IS + "]");

            for (var i = 0; i < hooks.length; i++) {
                var hook = hooks[i];
                if (hook.closest("." + NS + "-" + IS) === that._elements.self) { // only process own accordion elements
                    var capitalized = IS;
                    capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
                    var key = hook.dataset[NS + "Hook" + capitalized];
                    if (that._elements[key]) {
                        if (!Array.isArray(that._elements[key])) {
                            var tmp = that._elements[key];
                            that._elements[key] = [tmp];
                        }
                        that._elements[key].push(hook);
                    } else {
                        that._elements[key] = hook;
                    }
                }
            }
        }

        /**
         * Sets up properties for the Accordion based on the passed options.
         *
         * @private
         * @param {Object} options The Accordion options
         */
        function setupProperties(options) {
            that._properties = {};

            for (var key in properties) {
                if (Object.prototype.hasOwnProperty.call(properties, key)) {
                    var property = properties[key];
                    var value = null;

                    if (options && options[key] != null) {
                        value = options[key];

                        // transform the provided option
                        if (property && typeof property.transform === "function") {
                            value = property.transform(value);
                        }
                    }

                    if (value === null) {
                        // value still null, take the property default
                        value = properties[key]["default"];
                    }

                    that._properties[key] = value;
                }
            }
        }

        /**
         * Binds Accordion event handling.
         *
         * @private
         */
        function bindEvents() {
            window.addEventListener("hashchange", scrollToDeepLinkIdInAccordion, false);
            var buttons = that._elements["button"];
            if (buttons) {
                for (var i = 0; i < buttons.length; i++) {
                    (function(index) {
                        buttons[i].addEventListener("click", function(event) {
                            toggle(index);
                            focusButton(index);
                        });
                        buttons[i].addEventListener("keydown", function(event) {
                            onButtonKeyDown(event, index);
                        });
                    })(i);
                }
            }
        }

        /**
         * Handles button keydown events.
         *
         * @private
         * @param {Object} event The keydown event
         * @param {Number} index The index of the button triggering the event
         */
        function onButtonKeyDown(event, index) {
            var lastIndex = that._elements["button"].length - 1;

            switch (event.keyCode) {
                case keyCodes.ARROW_LEFT:
                case keyCodes.ARROW_UP:
                    event.preventDefault();
                    if (index > 0) {
                        focusButton(index - 1);
                    }
                    break;
                case keyCodes.ARROW_RIGHT:
                case keyCodes.ARROW_DOWN:
                    event.preventDefault();
                    if (index < lastIndex) {
                        focusButton(index + 1);
                    }
                    break;
                case keyCodes.HOME:
                    event.preventDefault();
                    focusButton(0);
                    break;
                case keyCodes.END:
                    event.preventDefault();
                    focusButton(lastIndex);
                    break;
                case keyCodes.ENTER:
                case keyCodes.SPACE:
                    event.preventDefault();
                    toggle(index);
                    focusButton(index);
                    break;
                default:
                    return;
            }
        }

        /**
         * General handler for toggle of an item.
         *
         * @private
         * @param {Number} index The index of the item to toggle
         */
        function toggle(index) {
            var item = that._elements["item"][index];
            if (item) {
                if (that._properties.singleExpansion) {
                    // ensure only a single item is expanded if single expansion is enabled.
                    for (var i = 0; i < that._elements["item"].length; i++) {
                        if (that._elements["item"][i] !== item) {
                            var expanded = getItemExpanded(that._elements["item"][i]);
                            if (expanded) {
                                setItemExpanded(that._elements["item"][i], false);
                            }
                        }
                    }
                }
                setItemExpanded(item, !getItemExpanded(item));

                if (dataLayerEnabled) {
                    var accordionId = that._elements.self.id;
                    var expandedItems = getExpandedItems()
                        .map(function(item) {
                            return getDataLayerId(item);
                        });

                    var uploadPayload = { component: {} };
                    uploadPayload.component[accordionId] = { shownItems: expandedItems };

                    var removePayload = { component: {} };
                    removePayload.component[accordionId] = { shownItems: undefined };

                    dataLayer.push(removePayload);
                    dataLayer.push(uploadPayload);
                }
            }
        }

        /**
         * Sets an item's expanded state based on the provided flag and refreshes its internals.
         *
         * @private
         * @param {HTMLElement} item The item to mark as expanded, or not expanded
         * @param {Boolean} expanded true to mark the item expanded, false otherwise
         * @param {Boolean} keepHash true to keep the hash in the URL, false to update it
         */
        function setItemExpanded(item, expanded, keepHash) {
            if (expanded) {
                item.setAttribute(dataAttributes.item.expanded, "");
                var index = that._elements["item"].indexOf(item);
                if (!keepHash && containerUtils) {
                    containerUtils.updateUrlHash(that, "item", index);
                }
                if (dataLayerEnabled) {
                    dataLayer.push({
                        event: "cmp:show",
                        eventInfo: {
                            path: "component." + getDataLayerId(item)
                        }
                    });
                }

            } else {
                item.removeAttribute(dataAttributes.item.expanded);
                if (!keepHash && containerUtils) {
                    containerUtils.removeUrlHash();
                }
                if (dataLayerEnabled) {
                    dataLayer.push({
                        event: "cmp:hide",
                        eventInfo: {
                            path: "component." + getDataLayerId(item)
                        }
                    });
                }
            }
            refreshItem(item);
        }

        /**
         * Gets an item's expanded state.
         *
         * @private
         * @param {HTMLElement} item The item for checking its expanded state
         * @returns {Boolean} true if the item is expanded, false otherwise
         */
        function getItemExpanded(item) {
            return item && item.dataset && item.dataset["cmpExpanded"] !== undefined;
        }

        /**
         * Refreshes an item based on its expanded state.
         *
         * @private
         * @param {HTMLElement} item The item to refresh
         */
        function refreshItem(item) {
            var expanded = getItemExpanded(item);
            if (expanded) {
                expandItem(item);
            } else {
                collapseItem(item);
            }
        }

        /**
         * Refreshes all items based on their expanded state.
         *
         * @private
         */
        function refreshItems() {
            for (var i = 0; i < that._elements["item"].length; i++) {
                refreshItem(that._elements["item"][i]);
            }
        }

        /**
         * Returns all expanded items.
         *
         * @private
         * @returns {HTMLElement[]} The expanded items
         */
        function getExpandedItems() {
            var expandedItems = [];

            for (var i = 0; i < that._elements["item"].length; i++) {
                var item = that._elements["item"][i];
                var expanded = getItemExpanded(item);
                if (expanded) {
                    expandedItems.push(item);
                }
            }

            return expandedItems;
        }

        /**
         * Annotates the item and its internals with
         * the necessary style and accessibility attributes to indicate it is expanded.
         *
         * @private
         * @param {HTMLElement} item The item to annotate as expanded
         */
        function expandItem(item) {
            var index = that._elements["item"].indexOf(item);
            if (index > -1) {
                var button = that._elements["button"][index];
                var panel = that._elements["panel"][index];
                button.classList.add(cssClasses.button.expanded);
                // used to fix some known screen readers issues in reading the correct state of the 'aria-expanded' attribute
                // e.g. https://bugs.webkit.org/show_bug.cgi?id=210934
                setTimeout(function() {
                    button.setAttribute("aria-expanded", true);
                }, delay);
                panel.classList.add(cssClasses.panel.expanded);
                panel.classList.remove(cssClasses.panel.hidden);
                panel.setAttribute("aria-hidden", false);
            }
        }

        /**
         * Annotates the item and its internals with
         * the necessary style and accessibility attributes to indicate it is not expanded.
         *
         * @private
         * @param {HTMLElement} item The item to annotate as not expanded
         */
        function collapseItem(item) {
            var index = that._elements["item"].indexOf(item);
            if (index > -1) {
                var button = that._elements["button"][index];
                var panel = that._elements["panel"][index];
                button.classList.remove(cssClasses.button.expanded);
                // used to fix some known screen readers issues in reading the correct state of the 'aria-expanded' attribute
                // e.g. https://bugs.webkit.org/show_bug.cgi?id=210934
                setTimeout(function() {
                    button.setAttribute("aria-expanded", false);
                }, delay);
                panel.classList.add(cssClasses.panel.hidden);
                panel.classList.remove(cssClasses.panel.expanded);
                panel.setAttribute("aria-hidden", true);
            }
        }

        /**
         * Focuses the button at the provided index.
         *
         * @private
         * @param {Number} index The index of the button to focus
         */
        function focusButton(index) {
            var button = that._elements["button"][index];
            button.focus();
        }
    }

    /**
     * Reads options data from the Accordion wrapper element, defined via {@code data-cmp-*} data attributes.
     *
     * @private
     * @param {HTMLElement} element The Accordion element to read options data from
     * @returns {Object} The options read from the component data attributes
     */
    function readData(element) {
        var data = element.dataset;
        var options = [];
        var capitalized = IS;
        capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
        var reserved = ["is", "hook" + capitalized];

        for (var key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                var value = data[key];

                if (key.indexOf(NS) === 0) {
                    key = key.slice(NS.length);
                    key = key.charAt(0).toLowerCase() + key.substring(1);

                    if (reserved.indexOf(key) === -1) {
                        options[key] = value;
                    }
                }
            }
        }

        return options;
    }

    /**
     * Parses the dataLayer string and returns the ID
     *
     * @private
     * @param {HTMLElement} item the accordion item
     * @returns {String} dataLayerId or undefined
     */
    function getDataLayerId(item) {
        if (item) {
            if (item.dataset.cmpDataLayer) {
                return Object.keys(JSON.parse(item.dataset.cmpDataLayer))[0];
            } else {
                return item.id;
            }
        }
        return null;
    }

    /**
     * Document ready handler and DOM mutation observers. Initializes Accordion components as necessary.
     *
     * @private
     */
    function onDocumentReady() {
        dataLayerEnabled = document.body.hasAttribute("data-cmp-data-layer-enabled");
        dataLayer = (dataLayerEnabled) ? window.adobeDataLayer = window.adobeDataLayer || [] : undefined;

        var elements = document.querySelectorAll(selectors.self);
        for (var i = 0; i < elements.length; i++) {
            new Accordion({ element: elements[i], options: readData(elements[i]) });
        }

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
        var body = document.querySelector("body");
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // needed for IE
                var nodesArray = [].slice.call(mutation.addedNodes);
                if (nodesArray.length > 0) {
                    nodesArray.forEach(function(addedNode) {
                        if (addedNode.querySelectorAll) {
                            var elementsArray = [].slice.call(addedNode.querySelectorAll(selectors.self));
                            elementsArray.forEach(function(element) {
                                new Accordion({ element: element, options: readData(element) });
                            });
                        }
                    });
                }
            });
        });

        observer.observe(body, {
            subtree: true,
            childList: true,
            characterData: true
        });
    }

    if (document.readyState !== "loading") {
        onDocumentReady();
    } else {
        document.addEventListener("DOMContentLoaded", onDocumentReady);
    }

    if (containerUtils) {
        window.addEventListener("load", containerUtils.scrollToAnchor, false);
    }

}());

/*******************************************************************************
 * Copyright 2018 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/

/**
 * Element.matches()
 * https://developer.mozilla.org/enUS/docs/Web/API/Element/matches#Polyfill
 */
if (!Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
}

// eslint-disable-next-line valid-jsdoc
/**
 * Element.closest()
 * https://developer.mozilla.org/enUS/docs/Web/API/Element/closest#Polyfill
 */
if (!Element.prototype.closest) {
    Element.prototype.closest = function(s) {
        "use strict";
        var el = this;
        if (!document.documentElement.contains(el)) {
            return null;
        }
        do {
            if (el.matches(s)) {
                return el;
            }
            el = el.parentElement || el.parentNode;
        } while (el !== null && el.nodeType === 1);
        return null;
    };
}

/*******************************************************************************
 * Copyright 2018 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
/* global
    CQ
 */
(function() {
    "use strict";

    var containerUtils = window.CQ && window.CQ.CoreComponents && window.CQ.CoreComponents.container && window.CQ.CoreComponents.container.utils ? window.CQ.CoreComponents.container.utils : undefined;
    if (!containerUtils) {
        // eslint-disable-next-line no-console
        console.warn("Tabs: container utilities at window.CQ.CoreComponents.container.utils are not available. This can lead to missing features. Ensure the core.wcm.components.commons.site.container client library is included on the page.");
    }
    var dataLayerEnabled;
    var dataLayer;

    var NS = "cmp";
    var IS = "tabs";

    var keyCodes = {
        END: 35,
        HOME: 36,
        ARROW_LEFT: 37,
        ARROW_UP: 38,
        ARROW_RIGHT: 39,
        ARROW_DOWN: 40
    };

    var selectors = {
        self: "[data-" + NS + '-is="' + IS + '"]',
        active: {
            tab: "cmp-tabs__tab--active",
            tabpanel: "cmp-tabs__tabpanel--active"
        }
    };

    /**
     * Tabs Configuration
     *
     * @typedef {Object} TabsConfig Represents a Tabs configuration
     * @property {HTMLElement} element The HTMLElement representing the Tabs
     * @property {Object} options The Tabs options
     */

    /**
     * Tabs
     *
     * @class Tabs
     * @classdesc An interactive Tabs component for navigating a list of tabs
     * @param {TabsConfig} config The Tabs configuration
     */
    function Tabs(config) {
        var that = this;

        if (config && config.element) {
            init(config);
        }

        /**
         * Initializes the Tabs
         *
         * @private
         * @param {TabsConfig} config The Tabs configuration
         */
        function init(config) {
            that._config = config;

            // prevents multiple initialization
            config.element.removeAttribute("data-" + NS + "-is");

            cacheElements(config.element);
            that._active = getActiveIndex(that._elements["tab"]);

            if (that._elements.tabpanel) {
                refreshActive();
                bindEvents();
                scrollToDeepLinkIdInTabs();
            }

            if (window.Granite && window.Granite.author && window.Granite.author.MessageChannel) {
                /*
                 * Editor message handling:
                 * - subscribe to "cmp.panelcontainer" message requests sent by the editor frame
                 * - check that the message data panel container type is correct and that the id (path) matches this specific Tabs component
                 * - if so, route the "navigate" operation to enact a navigation of the Tabs based on index data
                 */
                CQ.CoreComponents.MESSAGE_CHANNEL = CQ.CoreComponents.MESSAGE_CHANNEL || new window.Granite.author.MessageChannel("cqauthor", window);
                CQ.CoreComponents.MESSAGE_CHANNEL.subscribeRequestMessage("cmp.panelcontainer", function(message) {
                    if (message.data && message.data.type === "cmp-tabs" && message.data.id === that._elements.self.dataset["cmpPanelcontainerId"]) {
                        if (message.data.operation === "navigate") {
                            navigate(message.data.index);
                        }
                    }
                });
            }
        }

        /**
         * Displays the panel containing the element that corresponds to the deep link in the URI fragment
         * and scrolls the browser to this element.
         */
        function scrollToDeepLinkIdInTabs() {
            if (containerUtils) {
                var deepLinkItemIdx = containerUtils.getDeepLinkItemIdx(that, "tab", "tabpanel");
                if (deepLinkItemIdx > -1) {
                    var deepLinkItem = that._elements["tab"][deepLinkItemIdx];
                    if (deepLinkItem && that._elements["tab"][that._active].id !== deepLinkItem.id) {
                        navigateAndFocusTab(deepLinkItemIdx, true);
                    }
                    var hashId = window.location.hash.substring(1);
                    if (hashId) {
                        var hashItem = document.querySelector("[id='" + hashId + "']");
                        if (hashItem) {
                            hashItem.scrollIntoView();
                        }
                    }
                }
            }
        }

        /**
         * Returns the index of the active tab, if no tab is active returns 0
         *
         * @param {Array} tabs Tab elements
         * @returns {Number} Index of the active tab, 0 if none is active
         */
        function getActiveIndex(tabs) {
            if (tabs) {
                for (var i = 0; i < tabs.length; i++) {
                    if (tabs[i].classList.contains(selectors.active.tab)) {
                        return i;
                    }
                }
            }
            return 0;
        }

        /**
         * Caches the Tabs elements as defined via the {@code data-tabs-hook="ELEMENT_NAME"} markup API
         *
         * @private
         * @param {HTMLElement} wrapper The Tabs wrapper element
         */
        function cacheElements(wrapper) {
            that._elements = {};
            that._elements.self = wrapper;
            var hooks = that._elements.self.querySelectorAll("[data-" + NS + "-hook-" + IS + "]");

            for (var i = 0; i < hooks.length; i++) {
                var hook = hooks[i];
                if (hook.closest("." + NS + "-" + IS) === that._elements.self) { // only process own tab elements
                    var capitalized = IS;
                    capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
                    var key = hook.dataset[NS + "Hook" + capitalized];
                    if (that._elements[key]) {
                        if (!Array.isArray(that._elements[key])) {
                            var tmp = that._elements[key];
                            that._elements[key] = [tmp];
                        }
                        that._elements[key].push(hook);
                    } else {
                        that._elements[key] = hook;
                    }
                }
            }
        }

        /**
         * Binds Tabs event handling
         *
         * @private
         */
        function bindEvents() {
            window.addEventListener("hashchange", scrollToDeepLinkIdInTabs, false);
            var tabs = that._elements["tab"];
            if (tabs) {
                for (var i = 0; i < tabs.length; i++) {
                    (function(index) {
                        tabs[i].addEventListener("click", function(event) {
                            navigateAndFocusTab(index);
                        });
                        tabs[i].addEventListener("keydown", function(event) {
                            onKeyDown(event);
                        });
                    })(i);
                }
            }
        }

        /**
         * Handles tab keydown events
         *
         * @private
         * @param {Object} event The keydown event
         */
        function onKeyDown(event) {
            var index = that._active;
            var lastIndex = that._elements["tab"].length - 1;

            switch (event.keyCode) {
                case keyCodes.ARROW_LEFT:
                case keyCodes.ARROW_UP:
                    event.preventDefault();
                    if (index > 0) {
                        navigateAndFocusTab(index - 1);
                    }
                    break;
                case keyCodes.ARROW_RIGHT:
                case keyCodes.ARROW_DOWN:
                    event.preventDefault();
                    if (index < lastIndex) {
                        navigateAndFocusTab(index + 1);
                    }
                    break;
                case keyCodes.HOME:
                    event.preventDefault();
                    navigateAndFocusTab(0);
                    break;
                case keyCodes.END:
                    event.preventDefault();
                    navigateAndFocusTab(lastIndex);
                    break;
                default:
                    return;
            }
        }

        /**
         * Refreshes the tab markup based on the current {@code Tabs#_active} index
         *
         * @private
         */
        function refreshActive() {
            var tabpanels = that._elements["tabpanel"];
            var tabs = that._elements["tab"];

            if (tabpanels) {
                if (Array.isArray(tabpanels)) {
                    for (var i = 0; i < tabpanels.length; i++) {
                        if (i === parseInt(that._active)) {
                            tabpanels[i].classList.add(selectors.active.tabpanel);
                            tabpanels[i].removeAttribute("aria-hidden");
                            tabs[i].classList.add(selectors.active.tab);
                            tabs[i].setAttribute("aria-selected", true);
                            tabs[i].setAttribute("tabindex", "0");
                        } else {
                            tabpanels[i].classList.remove(selectors.active.tabpanel);
                            tabpanels[i].setAttribute("aria-hidden", true);
                            tabs[i].classList.remove(selectors.active.tab);
                            tabs[i].setAttribute("aria-selected", false);
                            tabs[i].setAttribute("tabindex", "-1");
                        }
                    }
                } else {
                    // only one tab
                    tabpanels.classList.add(selectors.active.tabpanel);
                    tabs.classList.add(selectors.active.tab);
                }
            }
        }

        /**
         * Focuses the element and prevents scrolling the element into view
         *
         * @param {HTMLElement} element Element to focus
         */
        function focusWithoutScroll(element) {
            var x = window.scrollX || window.pageXOffset;
            var y = window.scrollY || window.pageYOffset;
            element.focus();
            window.scrollTo(x, y);
        }

        /**
         * Navigates to the tab at the provided index
         *
         * @private
         * @param {Number} index The index of the tab to navigate to
         */
        function navigate(index) {
            that._active = index;
            refreshActive();
        }

        /**
         * Navigates to the item at the provided index and ensures the active tab gains focus
         *
         * @private
         * @param {Number} index The index of the item to navigate to
         * @param {Boolean} keepHash true to keep the hash in the URL, false to update it
         */
        function navigateAndFocusTab(index, keepHash) {
            var exActive = that._active;
            if (!keepHash && containerUtils) {
                containerUtils.updateUrlHash(that, "tab", index);
            }
            navigate(index);
            focusWithoutScroll(that._elements["tab"][index]);

            if (dataLayerEnabled) {

                var activeItem = getDataLayerId(that._elements.tabpanel[index]);
                var exActiveItem = getDataLayerId(that._elements.tabpanel[exActive]);

                dataLayer.push({
                    event: "cmp:show",
                    eventInfo: {
                        path: "component." + activeItem
                    }
                });

                dataLayer.push({
                    event: "cmp:hide",
                    eventInfo: {
                        path: "component." + exActiveItem
                    }
                });

                var tabsId = that._elements.self.id;
                var uploadPayload = { component: {} };
                uploadPayload.component[tabsId] = { shownItems: [activeItem] };

                var removePayload = { component: {} };
                removePayload.component[tabsId] = { shownItems: undefined };

                dataLayer.push(removePayload);
                dataLayer.push(uploadPayload);
            }
        }
    }

    /**
     * Reads options data from the Tabs wrapper element, defined via {@code data-cmp-*} data attributes
     *
     * @private
     * @param {HTMLElement} element The Tabs element to read options data from
     * @returns {Object} The options read from the component data attributes
     */
    function readData(element) {
        var data = element.dataset;
        var options = [];
        var capitalized = IS;
        capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
        var reserved = ["is", "hook" + capitalized];

        for (var key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                var value = data[key];

                if (key.indexOf(NS) === 0) {
                    key = key.slice(NS.length);
                    key = key.charAt(0).toLowerCase() + key.substring(1);

                    if (reserved.indexOf(key) === -1) {
                        options[key] = value;
                    }
                }
            }
        }

        return options;
    }

    /**
     * Parses the dataLayer string and returns the ID
     *
     * @private
     * @param {HTMLElement} item the accordion item
     * @returns {String} dataLayerId or undefined
     */
    function getDataLayerId(item) {
        if (item) {
            if (item.dataset.cmpDataLayer) {
                return Object.keys(JSON.parse(item.dataset.cmpDataLayer))[0];
            } else {
                return item.id;
            }
        }
        return null;
    }

    /**
     * Document ready handler and DOM mutation observers. Initializes Tabs components as necessary.
     *
     * @private
     */
    function onDocumentReady() {
        dataLayerEnabled = document.body.hasAttribute("data-cmp-data-layer-enabled");
        dataLayer = (dataLayerEnabled) ? window.adobeDataLayer = window.adobeDataLayer || [] : undefined;

        var elements = document.querySelectorAll(selectors.self);
        for (var i = 0; i < elements.length; i++) {
            new Tabs({ element: elements[i], options: readData(elements[i]) });
        }

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
        var body = document.querySelector("body");
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // needed for IE
                var nodesArray = [].slice.call(mutation.addedNodes);
                if (nodesArray.length > 0) {
                    nodesArray.forEach(function(addedNode) {
                        if (addedNode.querySelectorAll) {
                            var elementsArray = [].slice.call(addedNode.querySelectorAll(selectors.self));
                            elementsArray.forEach(function(element) {
                                new Tabs({ element: element, options: readData(element) });
                            });
                        }
                    });
                }
            });
        });

        observer.observe(body, {
            subtree: true,
            childList: true,
            characterData: true
        });
    }

    if (document.readyState !== "loading") {
        onDocumentReady();
    } else {
        document.addEventListener("DOMContentLoaded", onDocumentReady);
    }

    if (containerUtils) {
        window.addEventListener("load", containerUtils.scrollToAnchor, false);
    }

}());

/*******************************************************************************
 * Copyright 2022 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function(document) {
    "use strict";

    window.CMP = window.CMP || {};
    window.CMP.utils = (function() {
        var NS = "cmp";

        /**
         * Reads options data from the Component wrapper element, defined via {@code data-cmp-*} data attributes
         *
         * @param {HTMLElement} element The component element to read options data from
         * @param {String} is The component identifier
         * @returns {String[]} The options read from the component data attributes
         */
        var readData = function(element, is) {
            var data = element.dataset;
            var options = [];
            var capitalized = is;
            capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
            var reserved = ["is", "hook" + capitalized];

            for (var key in data) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    var value = data[key];

                    if (key.indexOf(NS) === 0) {
                        key = key.slice(NS.length);
                        key = key.charAt(0).toLowerCase() + key.substring(1);

                        if (reserved.indexOf(key) === -1) {
                            options[key] = value;
                        }
                    }
                }
            }
            return options;
        };

        /**
         * Set up the final properties of a component by evaluating the transform function or fall back to the default value on demand
         * @param {String[]} options the options to transform
         * @param {Object} properties object of properties of property functions
         * @returns {Object} transformed properties
         */
        var setupProperties = function(options, properties) {
            var transformedProperties = {};

            for (var key in properties) {
                if (Object.prototype.hasOwnProperty.call(properties, key)) {
                    var property = properties[key];
                    if (options && options[key] != null) {
                        if (property && typeof property.transform === "function") {
                            transformedProperties[key] = property.transform(options[key]);
                        } else {
                            transformedProperties[key] = options[key];
                        }
                    } else {
                        transformedProperties[key] = properties[key]["default"];
                    }
                }
            }
            return transformedProperties;
        };


        return {
            readData: readData,
            setupProperties: setupProperties
        };
    }());
}(window.document));

/*******************************************************************************
 * Copyright 2018 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function() {
    "use strict";

    var containerUtils = window.CQ && window.CQ.CoreComponents && window.CQ.CoreComponents.container && window.CQ.CoreComponents.container.utils ? window.CQ.CoreComponents.container.utils : undefined;
    if (!containerUtils) {
        // eslint-disable-next-line no-console
        console.warn("Tabs: container utilities at window.CQ.CoreComponents.container.utils are not available. This can lead to missing features. Ensure the core.wcm.components.commons.site.container client library is included on the page.");
    }
    var dataLayerEnabled;
    var dataLayer;

    var NS = "cmp";
    var IS = "carousel";

    var keyCodes = {
        SPACE: 32,
        END: 35,
        HOME: 36,
        ARROW_LEFT: 37,
        ARROW_UP: 38,
        ARROW_RIGHT: 39,
        ARROW_DOWN: 40
    };

    var selectors = {
        self: "[data-" + NS + '-is="' + IS + '"]'
    };

    var properties = {
        /**
         * Determines whether the Carousel will automatically transition between slides
         *
         * @memberof Carousel
         * @type {Boolean}
         * @default false
         */
        "autoplay": {
            "default": false,
            "transform": function(value) {
                return !(value === null || typeof value === "undefined");
            }
        },
        /**
         * Duration (in milliseconds) before automatically transitioning to the next slide
         *
         * @memberof Carousel
         * @type {Number}
         * @default 5000
         */
        "delay": {
            "default": 5000,
            "transform": function(value) {
                value = parseFloat(value);
                return !isNaN(value) ? value : null;
            }
        },
        /**
         * Determines whether automatic pause on hovering the carousel is disabled
         *
         * @memberof Carousel
         * @type {Boolean}
         * @default false
         */
        "autopauseDisabled": {
            "default": false,
            "transform": function(value) {
                return !(value === null || typeof value === "undefined");
            }
        }
    };

    /**
     * Carousel Configuration
     *
     * @typedef {Object} CarouselConfig Represents a Carousel configuration
     * @property {HTMLElement} element The HTMLElement representing the Carousel
     * @property {*[]} options The Carousel options
     */

    /**
     * Carousel
     *
     * @class Carousel
     * @classdesc An interactive Carousel component for navigating a list of generic items
     * @param {CarouselConfig} config The Carousel configuration
     */
    function Carousel(config) {
        var that = this;

        if (config && config.element) {
            init(config);
        }

        /**
         * Initializes the Carousel
         *
         * @private
         * @param {CarouselConfig} config The Carousel configuration
         */
        function init(config) {
            that._config = config;

            // prevents multiple initialization
            config.element.removeAttribute("data-" + NS + "-is");

            setupProperties(config.options);
            cacheElements(config.element);

            that._active = 0;
            that._paused = false;

            if (that._elements.item) {
                initializeActive();
                bindEvents();
                resetAutoplayInterval();
                refreshPlayPauseActions();
                scrollToDeepLinkIdInCarousel();
            }

            // TODO: This section is only relevant in edit mode and should move to the editor clientLib
            if (window.Granite && window.Granite.author && window.Granite.author.MessageChannel) {
                /*
                 * Editor message handling:
                 * - subscribe to "cmp.panelcontainer" message requests sent by the editor frame
                 * - check that the message data panel container type is correct and that the id (path) matches this specific Carousel component
                 * - if so, route the "navigate" operation to enact a navigation of the Carousel based on index data
                 */
                window.CQ = window.CQ || {};
                window.CQ.CoreComponents = window.CQ.CoreComponents || {};
                window.CQ.CoreComponents.MESSAGE_CHANNEL = window.CQ.CoreComponents.MESSAGE_CHANNEL || new window.Granite.author.MessageChannel("cqauthor", window);
                window.CQ.CoreComponents.MESSAGE_CHANNEL.subscribeRequestMessage("cmp.panelcontainer", function(message) {
                    if (message.data && message.data.type === "cmp-carousel" && message.data.id === that._elements.self.dataset["cmpPanelcontainerId"]) {
                        if (message.data.operation === "navigate") {
                            navigate(message.data.index);
                        }
                    }
                });
            }
        }

        /**
         * Displays the slide containing the element that corresponds to the deep link in the URI fragment
         * and scrolls the browser to this element.
         */
        function scrollToDeepLinkIdInCarousel() {
            if (containerUtils) {
                var deepLinkItemIdx = containerUtils.getDeepLinkItemIdx(that, "item", "item");
                if (deepLinkItemIdx > -1) {
                    var deepLinkItem = that._elements["item"][deepLinkItemIdx];
                    if (deepLinkItem && that._elements["item"][that._active].id !== deepLinkItem.id) {
                        navigateAndFocusIndicator(deepLinkItemIdx, true);
                        // pause the carousel auto-rotation
                        pause();
                    }
                    var hashId = window.location.hash.substring(1);
                    if (hashId) {
                        var hashItem = document.querySelector("[id='" + hashId + "']");
                        if (hashItem) {
                            hashItem.scrollIntoView();
                        }
                    }
                }
            }
        }

        /**
         * Caches the Carousel elements as defined via the {@code data-carousel-hook="ELEMENT_NAME"} markup API
         *
         * @private
         * @param {HTMLElement} wrapper The Carousel wrapper element
         */
        function cacheElements(wrapper) {
            that._elements = {};
            that._elements.self = wrapper;
            var hooks = that._elements.self.querySelectorAll("[data-" + NS + "-hook-" + IS + "]");

            for (var i = 0; i < hooks.length; i++) {
                var hook = hooks[i];
                var capitalized = IS;
                capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
                var key = hook.dataset[NS + "Hook" + capitalized];
                if (that._elements[key]) {
                    if (!Array.isArray(that._elements[key])) {
                        var tmp = that._elements[key];
                        that._elements[key] = [tmp];
                    }
                    that._elements[key].push(hook);
                } else {
                    that._elements[key] = hook;
                }
            }
        }

        /**
         * Sets up properties for the Carousel based on the passed options.
         *
         * @private
         * @param {Object} options The Carousel options
         */
        function setupProperties(options) {
            that._properties = {};

            for (var key in properties) {
                if (Object.prototype.hasOwnProperty.call(properties, key)) {
                    var property = properties[key];
                    var value = null;

                    if (options && options[key] != null) {
                        value = options[key];

                        // transform the provided option
                        if (property && typeof property.transform === "function") {
                            value = property.transform(value);
                        }
                    }

                    if (value === null) {
                        // value still null, take the property default
                        value = properties[key]["default"];
                    }

                    that._properties[key] = value;
                }
            }
        }

        /**
         * Binds Carousel event handling
         *
         * @private
         */
        function bindEvents() {
            window.addEventListener("hashchange", scrollToDeepLinkIdInCarousel, false);
            if (that._elements["previous"]) {
                that._elements["previous"].addEventListener("click", function() {
                    var index = getPreviousIndex();
                    navigate(index);
                    if (dataLayerEnabled) {
                        dataLayer.push({
                            event: "cmp:show",
                            eventInfo: {
                                path: "component." + getDataLayerId(that._elements.item[index])
                            }
                        });
                    }
                });
            }

            if (that._elements["next"]) {
                that._elements["next"].addEventListener("click", function() {
                    var index = getNextIndex();
                    navigate(index);
                    if (dataLayerEnabled) {
                        dataLayer.push({
                            event: "cmp:show",
                            eventInfo: {
                                path: "component." + getDataLayerId(that._elements.item[index])
                            }
                        });
                    }
                });
            }

            var indicators = that._elements["indicator"];
            if (indicators) {
                for (var i = 0; i < indicators.length; i++) {
                    (function(index) {
                        indicators[i].addEventListener("click", function(event) {
                            navigateAndFocusIndicator(index);
                            // pause the carousel auto-rotation
                            pause();
                        });
                    })(i);
                }
            }

            if (that._elements["pause"]) {
                if (that._properties.autoplay) {
                    that._elements["pause"].addEventListener("click", onPauseClick);
                }
            }

            if (that._elements["play"]) {
                if (that._properties.autoplay) {
                    that._elements["play"].addEventListener("click", onPlayClick);
                }
            }

            that._elements.self.addEventListener("keydown", onKeyDown);

            if (!that._properties.autopauseDisabled) {
                that._elements.self.addEventListener("mouseenter", onMouseEnter);
                that._elements.self.addEventListener("mouseleave", onMouseLeave);
            }

            // for accessibility we pause animation when a element get focused
            var items = that._elements["item"];
            if (items) {
                for (var j = 0; j < items.length; j++) {
                    items[j].addEventListener("focusin", onMouseEnter);
                    items[j].addEventListener("focusout", onMouseLeave);
                }
            }
        }

        /**
         * Handles carousel keydown events
         *
         * @private
         * @param {Object} event The keydown event
         */
        function onKeyDown(event) {
            var index = that._active;
            var lastIndex = that._elements["indicator"].length - 1;

            switch (event.keyCode) {
                case keyCodes.ARROW_LEFT:
                case keyCodes.ARROW_UP:
                    event.preventDefault();
                    if (index > 0) {
                        navigateAndFocusIndicator(index - 1);
                    }
                    break;
                case keyCodes.ARROW_RIGHT:
                case keyCodes.ARROW_DOWN:
                    event.preventDefault();
                    if (index < lastIndex) {
                        navigateAndFocusIndicator(index + 1);
                    }
                    break;
                case keyCodes.HOME:
                    event.preventDefault();
                    navigateAndFocusIndicator(0);
                    break;
                case keyCodes.END:
                    event.preventDefault();
                    navigateAndFocusIndicator(lastIndex);
                    break;
                case keyCodes.SPACE:
                    if (that._properties.autoplay && (event.target !== that._elements["previous"] && event.target !== that._elements["next"])) {
                        event.preventDefault();
                        if (!that._paused) {
                            pause();
                        } else {
                            play();
                        }
                    }
                    if (event.target === that._elements["pause"]) {
                        that._elements["play"].focus();
                    }
                    if (event.target === that._elements["play"]) {
                        that._elements["pause"].focus();
                    }
                    break;
                default:
                    return;
            }
        }

        /**
         * Handles carousel mouseenter events
         *
         * @private
         * @param {Object} event The mouseenter event
         */
        function onMouseEnter(event) {
            clearAutoplayInterval();
        }

        /**
         * Handles carousel mouseleave events
         *
         * @private
         * @param {Object} event The mouseleave event
         */
        function onMouseLeave(event) {
            resetAutoplayInterval();
        }

        /**
         * Handles pause element click events
         *
         * @private
         * @param {Object} event The click event
         */
        function onPauseClick(event) {
            pause();
            that._elements["play"].focus();
        }

        /**
         * Handles play element click events
         *
         * @private
         * @param {Object} event The click event
         */
        function onPlayClick() {
            play();
            that._elements["pause"].focus();
        }

        /**
         * Pauses the playing of the Carousel. Sets {@code Carousel#_paused} marker.
         * Only relevant when autoplay is enabled
         *
         * @private
         */
        function pause() {
            that._paused = true;
            clearAutoplayInterval();
            refreshPlayPauseActions();
        }

        /**
         * Enables the playing of the Carousel. Sets {@code Carousel#_paused} marker.
         * Only relevant when autoplay is enabled
         *
         * @private
         */
        function play() {
            that._paused = false;

            // If the Carousel is hovered, don't begin auto transitioning until the next mouse leave event
            var hovered = false;
            if (that._elements.self.parentElement) {
                hovered = that._elements.self.parentElement.querySelector(":hover") === that._elements.self;
            }
            if (that._properties.autopauseDisabled || !hovered) {
                resetAutoplayInterval();
            }

            refreshPlayPauseActions();
        }

        /**
         * Refreshes the play/pause action markup based on the {@code Carousel#_paused} state
         *
         * @private
         */
        function refreshPlayPauseActions() {
            setActionDisabled(that._elements["pause"], that._paused);
            setActionDisabled(that._elements["play"], !that._paused);
        }

        /**
         * Initialize {@code Carousel#_active} based on the active item of the carousel.
         */
        function initializeActive() {
            var items = that._elements["item"];
            if (items && Array.isArray(items)) {
                for (var i = 0; i < items.length; i++) {
                    if (items[i].classList.contains("cmp-carousel__item--active")) {
                        that._active = i;
                        break;
                    }
                }
            }
        }

        /**
         * Refreshes the item markup based on the current {@code Carousel#_active} index
         *
         * @private
         */
        function refreshActive() {
            var items = that._elements["item"];
            var indicators = that._elements["indicator"];

            if (items) {
                if (Array.isArray(items)) {
                    for (var i = 0; i < items.length; i++) {
                        if (i === parseInt(that._active)) {
                            items[i].classList.add("cmp-carousel__item--active");
                            items[i].removeAttribute("aria-hidden");
                            indicators[i].classList.add("cmp-carousel__indicator--active");
                            indicators[i].setAttribute("aria-selected", true);
                            indicators[i].setAttribute("tabindex", "0");
                        } else {
                            items[i].classList.remove("cmp-carousel__item--active");
                            items[i].setAttribute("aria-hidden", true);
                            indicators[i].classList.remove("cmp-carousel__indicator--active");
                            indicators[i].setAttribute("aria-selected", false);
                            indicators[i].setAttribute("tabindex", "-1");
                        }
                    }
                } else {
                    // only one item
                    items.classList.add("cmp-carousel__item--active");
                    indicators.classList.add("cmp-carousel__indicator--active");
                }
            }
        }

        /**
         * Focuses the element and prevents scrolling the element into view
         *
         * @param {HTMLElement} element Element to focus
         */
        function focusWithoutScroll(element) {
            var x = window.scrollX || window.pageXOffset;
            var y = window.scrollY || window.pageYOffset;
            element.focus();
            window.scrollTo(x, y);
        }

        /**
         * Retrieves the next active index, with looping
         *
         * @private
         * @returns {Number} Index of the next carousel item
         */
        function getNextIndex() {
            return that._active === (that._elements["item"].length - 1) ? 0 : that._active + 1;
        }

        /**
         * Retrieves the previous active index, with looping
         *
         * @private
         * @returns {Number} Index of the previous carousel item
         */
        function getPreviousIndex() {
            return that._active === 0 ? (that._elements["item"].length - 1) : that._active - 1;
        }

        /**
         * Navigates to the item at the provided index
         *
         * @private
         * @param {Number} index The index of the item to navigate to
         * @param {Boolean} keepHash true to keep the hash in the URL, false to update it
         */
        function navigate(index, keepHash) {
            if (index < 0 || index > (that._elements["item"].length - 1)) {
                return;
            }

            that._active = index;
            refreshActive();

            if (!keepHash && containerUtils) {
                containerUtils.updateUrlHash(that, "item", index);
            }

            if (dataLayerEnabled) {
                var carouselId = that._elements.self.id;
                var activeItem = getDataLayerId(that._elements.item[index]);
                var updatePayload = { component: {} };
                updatePayload.component[carouselId] = { shownItems: [activeItem] };

                var removePayload = { component: {} };
                removePayload.component[carouselId] = { shownItems: undefined };

                dataLayer.push(removePayload);
                dataLayer.push(updatePayload);
            }

            // reset the autoplay transition interval following navigation, if not already hovering the carousel
            if (that._elements.self.parentElement) {
                if (that._elements.self.parentElement.querySelector(":hover") !== that._elements.self) {
                    resetAutoplayInterval();
                }
            }
        }

        /**
         * Navigates to the item at the provided index and ensures the active indicator gains focus
         *
         * @private
         * @param {Number} index The index of the item to navigate to
         * @param {Boolean} keepHash true to keep the hash in the URL, false to update it
         */
        function navigateAndFocusIndicator(index, keepHash) {
            navigate(index, keepHash);
            focusWithoutScroll(that._elements["indicator"][index]);

            if (dataLayerEnabled) {
                dataLayer.push({
                    event: "cmp:show",
                    eventInfo: {
                        path: "component." + getDataLayerId(that._elements.item[index])
                    }
                });
            }
        }

        /**
         * Starts/resets automatic slide transition interval
         *
         * @private
         */
        function resetAutoplayInterval() {
            if (that._paused || !that._properties.autoplay) {
                return;
            }
            clearAutoplayInterval();
            that._autoplayIntervalId = window.setInterval(function() {
                if (document.visibilityState && document.hidden) {
                    return;
                }
                var indicators = that._elements["indicators"];
                if (indicators !== document.activeElement && indicators.contains(document.activeElement)) {
                    // if an indicator has focus, ensure we switch focus following navigation
                    navigateAndFocusIndicator(getNextIndex(), true);
                } else {
                    navigate(getNextIndex(), true);
                }
            }, that._properties.delay);
        }

        /**
         * Clears/pauses automatic slide transition interval
         *
         * @private
         */
        function clearAutoplayInterval() {
            window.clearInterval(that._autoplayIntervalId);
            that._autoplayIntervalId = null;
        }

        /**
         * Sets the disabled state for an action and toggles the appropriate CSS classes
         *
         * @private
         * @param {HTMLElement} action Action to disable
         * @param {Boolean} [disable] {@code true} to disable, {@code false} to enable
         */
        function setActionDisabled(action, disable) {
            if (!action) {
                return;
            }
            if (disable !== false) {
                action.disabled = true;
                action.classList.add("cmp-carousel__action--disabled");
            } else {
                action.disabled = false;
                action.classList.remove("cmp-carousel__action--disabled");
            }
        }
    }

    /**
     * Parses the dataLayer string and returns the ID
     *
     * @private
     * @param {HTMLElement} item the accordion item
     * @returns {String} dataLayerId or undefined
     */
    function getDataLayerId(item) {
        if (item) {
            if (item.dataset.cmpDataLayer) {
                return Object.keys(JSON.parse(item.dataset.cmpDataLayer))[0];
            } else {
                return item.id;
            }
        }
        return null;
    }

    /**
     * Document ready handler and DOM mutation observers. Initializes Carousel components as necessary.
     *
     * @private
     */
    function onDocumentReady() {
        dataLayerEnabled = document.body.hasAttribute("data-cmp-data-layer-enabled");
        dataLayer = (dataLayerEnabled) ? window.adobeDataLayer = window.adobeDataLayer || [] : undefined;

        var elements = document.querySelectorAll(selectors.self);
        for (var i = 0; i < elements.length; i++) {
            new Carousel({ element: elements[i], options: CMP.utils.readData(elements[i], IS) });
        }

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
        var body = document.querySelector("body");
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // needed for IE
                var nodesArray = [].slice.call(mutation.addedNodes);
                if (nodesArray.length > 0) {
                    nodesArray.forEach(function(addedNode) {
                        if (addedNode.querySelectorAll) {
                            var elementsArray = [].slice.call(addedNode.querySelectorAll(selectors.self));
                            elementsArray.forEach(function(element) {
                                new Carousel({ element: element, options: CMP.utils.readData(element, IS) });
                            });
                        }
                    });
                }
            });
        });

        observer.observe(body, {
            subtree: true,
            childList: true,
            characterData: true
        });
    }

    var documentReady = document.readyState !== "loading" ? Promise.resolve() : new Promise(function(resolve) {
        document.addEventListener("DOMContentLoaded", resolve);
    });
    Promise.all([documentReady]).then(onDocumentReady);

    if (containerUtils) {
        window.addEventListener("load", containerUtils.scrollToAnchor, false);
    }

}());

/*******************************************************************************
 * Copyright 2017 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
if (window.Element && !Element.prototype.closest) {
    // eslint valid-jsdoc: "off"
    Element.prototype.closest =
        function(s) {
            "use strict";
            var matches = (this.document || this.ownerDocument).querySelectorAll(s);
            var el      = this;
            var i;
            do {
                i = matches.length;
                while (--i >= 0 && matches.item(i) !== el) {
                    // continue
                }
            } while ((i < 0) && (el = el.parentElement));
            return el;
        };
}

if (window.Element && !Element.prototype.matches) {
    Element.prototype.matches =
        Element.prototype.matchesSelector ||
        Element.prototype.mozMatchesSelector ||
        Element.prototype.msMatchesSelector ||
        Element.prototype.oMatchesSelector ||
        Element.prototype.webkitMatchesSelector ||
        function(s) {
            "use strict";
            var matches = (this.document || this.ownerDocument).querySelectorAll(s);
            var i       = matches.length;
            while (--i >= 0 && matches.item(i) !== this) {
                // continue
            }
            return i > -1;
        };
}

if (!Object.assign) {
    Object.assign = function(target, varArgs) { // .length of function is 2
        "use strict";
        if (target === null) {
            throw new TypeError("Cannot convert undefined or null to object");
        }

        var to = Object(target);

        for (var index = 1; index < arguments.length; index++) {
            var nextSource = arguments[index];

            if (nextSource !== null) {
                for (var nextKey in nextSource) {
                    if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                        to[nextKey] = nextSource[nextKey];
                    }
                }
            }
        }
        return to;
    };
}

(function(arr) {
    "use strict";
    arr.forEach(function(item) {
        if (Object.prototype.hasOwnProperty.call(item, "remove")) {
            return;
        }
        Object.defineProperty(item, "remove", {
            configurable: true,
            enumerable: true,
            writable: true,
            value: function remove() {
                this.parentNode.removeChild(this);
            }
        });
    });
})([Element.prototype, CharacterData.prototype, DocumentType.prototype]);

/*******************************************************************************
 * Copyright 2022 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function(document) {
    "use strict";

    window.CMP = window.CMP || {};
    window.CMP.utils = (function() {
        var NS = "cmp";

        /**
         * Reads options data from the Component wrapper element, defined via {@code data-cmp-*} data attributes
         *
         * @param {HTMLElement} element The component element to read options data from
         * @param {String} is The component identifier
         * @returns {String[]} The options read from the component data attributes
         */
        var readData = function(element, is) {
            var data = element.dataset;
            var options = [];
            var capitalized = is;
            capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
            var reserved = ["is", "hook" + capitalized];

            for (var key in data) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    var value = data[key];

                    if (key.indexOf(NS) === 0) {
                        key = key.slice(NS.length);
                        key = key.charAt(0).toLowerCase() + key.substring(1);

                        if (reserved.indexOf(key) === -1) {
                            options[key] = value;
                        }
                    }
                }
            }
            return options;
        };

        /**
         * Set up the final properties of a component by evaluating the transform function or fall back to the default value on demand
         * @param {String[]} options the options to transform
         * @param {Object} properties object of properties of property functions
         * @returns {Object} transformed properties
         */
        var setupProperties = function(options, properties) {
            var transformedProperties = {};

            for (var key in properties) {
                if (Object.prototype.hasOwnProperty.call(properties, key)) {
                    var property = properties[key];
                    if (options && options[key] != null) {
                        if (property && typeof property.transform === "function") {
                            transformedProperties[key] = property.transform(options[key]);
                        } else {
                            transformedProperties[key] = options[key];
                        }
                    } else {
                        transformedProperties[key] = properties[key]["default"];
                    }
                }
            }
            return transformedProperties;
        };


        return {
            readData: readData,
            setupProperties: setupProperties
        };
    }());
}(window.document));

/*******************************************************************************
 * Copyright 2022 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function(document) {
    "use strict";

    window.CMP = window.CMP || {};
    window.CMP.image = window.CMP.image || {};
    window.CMP.image.dynamicMedia = (function() {
        var autoSmartCrops = {};
        var SRC_URI_TEMPLATE_WIDTH_VAR = "{.width}";
        var SRC_URI_TEMPLATE_DPR_VAR = "{dpr}";
        var SRC_URI_DPR_OFF = "dpr=off";
        var SRC_URI_DPR_ON = "dpr=on,{dpr}";
        var dpr = window.devicePixelRatio || 1;
        var config = {
            minWidth: 20
        };

        /**
         * get auto smart crops from dm
         * @param {String} src the src uri
         * @returns {{}} the smart crop json object
         */
        var getAutoSmartCrops = function(src) {
            var request = new XMLHttpRequest();
            var url = src.split(SRC_URI_TEMPLATE_WIDTH_VAR)[0] + "?req=set,json";
            request.open("GET", url, false);
            request.onload = function() {
                if (request.status >= 200 && request.status < 400) {
                    // success status
                    var responseText = request.responseText;
                    var rePayload = new RegExp(/^(?:\/\*jsonp\*\/)?\s*([^()]+)\(([\s\S]+),\s*"[0-9]*"\);?$/gmi);
                    var rePayloadJSON = new RegExp(/^{[\s\S]*}$/gmi);
                    var resPayload = rePayload.exec(responseText);
                    var payload;
                    if (resPayload) {
                        var payloadStr = resPayload[2];
                        if (rePayloadJSON.test(payloadStr)) {
                            payload = JSON.parse(payloadStr);
                        }

                    }
                    // check "relation" - only in case of smartcrop preset
                    if (payload && payload.set.relation && payload.set.relation.length > 0) {
                        for (var i = 0; i < payload.set.relation.length; i++) {
                            autoSmartCrops[parseInt(payload.set.relation[i].userdata.SmartCropWidth)] =
                                ":" + payload.set.relation[i].userdata.SmartCropDef;
                        }
                    }
                } else {
                    // error status
                }
            };
            request.send();
            return autoSmartCrops;
        };

        /**
         * Build and return the srcset value based on the available auto smart crops
         * @param {String} src the src uri
         * @param {Object} smartCrops the smart crops object
         * @returns {String} the srcset
         */
        var getSrcSet = function(src, smartCrops) {
            var srcset;
            var keys = Object.keys(smartCrops);
            if (keys.length > 0) {
                srcset = [];
                for (var key in autoSmartCrops) {
                    srcset.push(src.replace(SRC_URI_TEMPLATE_WIDTH_VAR, smartCrops[key]) + " " + key + "w");
                }
            }
            return  srcset.join(",");
        };

        /**
         * Get the optimal width based on the available sizes
         * @param {[Number]} sizes the available sizes
         * @param {Number} width the element width
         * @returns {String} the optimal width
         */
        function getOptimalWidth(sizes, width) {
            var len = sizes.length;
            var key = 0;

            while ((key < len - 1) && (sizes[key] < width)) {
                key++;
            }

            return sizes[key] !== undefined ? sizes[key].toString() : width;
        }

        /**
         * Get the width of an element or parent element if the width is smaller than the minimum width
         * @param {HTMLElement} component the image component
         * @param {HTMLElement | Node} parent the parent element
         * @returns {Number} the width of the element
         */
        var getWidth = function(component, parent) {
            var width = component.offsetWidth;
            while (width < config.minWidth && parent && !component._autoWidth) {
                width =  parent.offsetWidth;
                parent = parent.parentNode;
            }
            return width;
        };

        /**
         * Set the src and srcset attribute for a Dynamic Media Image which auto smart crops enabled.
         * @param {HTMLElement} component the image component
         * @param {{}} properties the component properties
         */
        var setDMAttributes = function(component, properties) {
            // for v3 we first have to turn the dpr on
            var src = properties.src.replace(SRC_URI_DPR_OFF, SRC_URI_DPR_ON);
            src = src.replace(SRC_URI_TEMPLATE_DPR_VAR, dpr);
            var smartCrops = {};
            var width;
            if (properties["smartcroprendition"] === "SmartCrop:Auto") {
                smartCrops = getAutoSmartCrops(src);
            }
            var hasWidths = (properties.widths && properties.widths.length > 0) || Object.keys(smartCrops).length > 0;
            if (hasWidths) {
                var image = component.querySelector("img");
                var elemWidth = getWidth(component, component.parentNode);
                if (properties["smartcroprendition"] === "SmartCrop:Auto") {
                    image.setAttribute("srcset", CMP.image.dynamicMedia.getSrcSet(src, smartCrops));
                    width = getOptimalWidth(Object.keys(smartCrops, elemWidth));
                    image.setAttribute("src", CMP.image.dynamicMedia.getSrc(src, smartCrops[width]));
                } else {
                    width = getOptimalWidth(properties.widths, elemWidth);
                    image.setAttribute("src", CMP.image.dynamicMedia.getSrc(src, width));
                }
            }
        };

        /**
         * Get the src attribute based on the optimal width
         * @param {String} src the src uri
         * @param {String} width the element width
         * @returns {String} the final src attribute
         */
        var getSrc = function(src, width) {
            if (src.indexOf(SRC_URI_TEMPLATE_WIDTH_VAR) > -1) {
                src = src.replace(SRC_URI_TEMPLATE_WIDTH_VAR, width);
            }
            return src;
        };


        return {
            getAutoSmartCrops: getAutoSmartCrops,
            getSrcSet: getSrcSet,
            getSrc: getSrc,
            setDMAttributes: setDMAttributes,
            getWidth: getWidth
        };
    }());
    document.dispatchEvent(new CustomEvent("core.wcm.components.commons.site.image.dynamic-media.loaded"));
}(window.document));

/*******************************************************************************
 * Copyright 2016 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function() {
    "use strict";

    var NS = "cmp";
    var IS = "image";

    var EMPTY_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    var LAZY_THRESHOLD_DEFAULT = 0;
    var SRC_URI_TEMPLATE_WIDTH_VAR = "{.width}";
    var SRC_URI_TEMPLATE_WIDTH_VAR_ASSET_DELIVERY = "width={width}";
    var SRC_URI_TEMPLATE_DPR_VAR = "{dpr}";

    var selectors = {
        self: "[data-" + NS + '-is="' + IS + '"]',
        image: '[data-cmp-hook-image="image"]',
        map: '[data-cmp-hook-image="map"]',
        area: '[data-cmp-hook-image="area"]'
    };

    var lazyLoader = {
        "cssClass": "cmp-image__image--is-loading",
        "style": {
            "height": 0,
            "padding-bottom": "" // will be replaced with % ratio
        }
    };

    var properties = {
        /**
         * An array of alternative image widths (in pixels).
         * Used to replace a {.width} variable in the src property with an optimal width if a URI template is provided.
         *
         * @memberof Image
         * @type {Number[]}
         * @default []
         */
        "widths": {
            "default": [],
            "transform": function(value) {
                var widths = [];
                value.split(",").forEach(function(item) {
                    item = parseFloat(item);
                    if (!isNaN(item)) {
                        widths.push(item);
                    }
                });
                return widths;
            }
        },
        /**
         * Indicates whether the image should be rendered lazily.
         *
         * @memberof Image
         * @type {Boolean}
         * @default false
         */
        "lazy": {
            "default": false,
            "transform": function(value) {
                return !(value === null || typeof value === "undefined");
            }
        },
        /**
         * Indicates image is DynamicMedia image.
         *
         * @memberof Image
         * @type {Boolean}
         * @default false
         */
        "dmimage": {
            "default": false,
            "transform": function(value) {
                return !(value === null || typeof value === "undefined");
            }
        },
        /**
         * The lazy threshold.
         * This is the number of pixels, in advance of becoming visible, when an lazy-loading image should begin
         * to load.
         *
         * @memberof Image
         * @type {Number}
         * @default 0
         */
        "lazythreshold": {
            "default": 0,
            "transform": function(value) {
                var val =  parseInt(value);
                if (isNaN(val)) {
                    return LAZY_THRESHOLD_DEFAULT;
                }
                return val;
            }
        },
        /**
         * The image source.
         *
         * Can be a simple image source, or a URI template representation that
         * can be variable expanded - useful for building an image configuration with an alternative width.
         * e.g. '/path/image.coreimg{.width}.jpeg/1506620954214.jpeg'
         *
         * @memberof Image
         * @type {String}
         */
        "src": {
            "transform": function(value) {
                return decodeURIComponent(value);
            }
        }
    };

    var devicePixelRatio = window.devicePixelRatio || 1;

    function Image(config) {
        var that = this;

        var smartCrops = {};

        var useAssetDelivery = false;
        var srcUriTemplateWidthVar = SRC_URI_TEMPLATE_WIDTH_VAR;

        function init(config) {
            // prevents multiple initialization
            config.element.removeAttribute("data-" + NS + "-is");

            // check if asset delivery is used
            if (config.options.src && config.options.src.indexOf(SRC_URI_TEMPLATE_WIDTH_VAR_ASSET_DELIVERY) >= 0) {
                useAssetDelivery = true;
                srcUriTemplateWidthVar = SRC_URI_TEMPLATE_WIDTH_VAR_ASSET_DELIVERY;
            }

            that._properties = CMP.utils.setupProperties(config.options, properties);
            cacheElements(config.element);
            // check image is DM asset; if true try to make req=set
            if (config.options.src && Object.prototype.hasOwnProperty.call(config.options, "dmimage") && (config.options["smartcroprendition"] === "SmartCrop:Auto")) {
                smartCrops = CMP.image.dynamicMedia.getAutoSmartCrops(config.options.src);
            }

            if (!that._elements.noscript) {
                return;
            }

            that._elements.container = that._elements.link ? that._elements.link : that._elements.self;

            unwrapNoScript();

            if (that._properties.lazy) {
                addLazyLoader();
            }

            if (that._elements.map) {
                that._elements.image.addEventListener("load", onLoad);
            }

            window.addEventListener("resize", onWindowResize);
            ["focus", "click", "load", "transitionend", "animationend", "scroll"].forEach(function(name) {
                document.addEventListener(name, that.update);
            });

            that._elements.image.addEventListener("cmp-image-redraw", that.update);

            that._interSectionObserver = new IntersectionObserver(function(entries, interSectionObserver) {
                entries.forEach(function(entry) {
                    if (entry.intersectionRatio > 0) {
                        that.update();
                    }
                });
            });
            that._interSectionObserver.observe(that._elements.self);

            that.update();
        }

        function loadImage() {
            var hasWidths = (that._properties.widths && that._properties.widths.length > 0) || Object.keys(smartCrops).length > 0;
            var replacement;
            if (Object.keys(smartCrops).length > 0) {
                var optimalWidth = getOptimalWidth(Object.keys(smartCrops), false);
                replacement = smartCrops[optimalWidth];
            } else {
                replacement = hasWidths ? (that._properties.dmimage ? "" : ".") + getOptimalWidth(that._properties.widths, true) : "";
            }
            if (useAssetDelivery) {
                replacement = replacement !== "" ? ("width=" + replacement.substring(1)) : "";
            }
            var url = that._properties.src.replace(srcUriTemplateWidthVar, replacement);
            url = url.replace(SRC_URI_TEMPLATE_DPR_VAR, devicePixelRatio);

            var imgSrcAttribute = that._elements.image.getAttribute("src");

            if (url !== imgSrcAttribute) {
                if (imgSrcAttribute === null || imgSrcAttribute === EMPTY_PIXEL) {
                    that._elements.image.setAttribute("src", url);
                } else {
                    var urlTemplateParts = that._properties.src.split(srcUriTemplateWidthVar);
                    // check if image src was dynamically swapped meanwhile (e.g. by Target)
                    var isImageRefSame = imgSrcAttribute.startsWith(urlTemplateParts[0]);
                    if (isImageRefSame && urlTemplateParts.length > 1) {
                        isImageRefSame = imgSrcAttribute.endsWith(urlTemplateParts[urlTemplateParts.length - 1]);
                    }
                    if (isImageRefSame) {
                        that._elements.image.setAttribute("src", url);
                        if (!hasWidths) {
                            window.removeEventListener("scroll", that.update);
                        }
                    }
                }
            }
            if (that._lazyLoaderShowing) {
                that._elements.image.addEventListener("load", removeLazyLoader);
            }
            that._interSectionObserver.unobserve(that._elements.self);
        }

        function getOptimalWidth(widths, useDevicePixelRatio) {
            var container = that._elements.self;
            var containerWidth = container.clientWidth;
            while (containerWidth === 0 && container.parentNode) {
                container = container.parentNode;
                containerWidth = container.clientWidth;
            }

            var dpr = useDevicePixelRatio ? devicePixelRatio : 1;
            var optimalWidth = containerWidth * dpr;
            var len = widths.length;
            var key = 0;

            while ((key < len - 1) && (widths[key] < optimalWidth)) {
                key++;
            }

            return widths[key].toString();
        }

        function addLazyLoader() {
            var width = that._elements.image.getAttribute("width");
            var height = that._elements.image.getAttribute("height");

            if (width && height) {
                var ratio = (height / width) * 100;
                var styles = lazyLoader.style;

                styles["padding-bottom"] = ratio + "%";

                for (var s in styles) {
                    if (Object.prototype.hasOwnProperty.call(styles, s)) {
                        that._elements.image.style[s] = styles[s];
                    }
                }
            }
            that._elements.image.setAttribute("src", EMPTY_PIXEL);
            that._elements.image.classList.add(lazyLoader.cssClass);
            that._lazyLoaderShowing = true;
        }

        function unwrapNoScript() {
            var markup = decodeNoscript(that._elements.noscript.textContent.trim());
            var parser = new DOMParser();

            // temporary document avoids requesting the image before removing its src
            var temporaryDocument = parser.parseFromString(markup, "text/html");
            var imageElement = temporaryDocument.querySelector(selectors.image);
            imageElement.removeAttribute("src");
            that._elements.container.insertBefore(imageElement, that._elements.noscript);

            var mapElement = temporaryDocument.querySelector(selectors.map);
            if (mapElement) {
                that._elements.container.insertBefore(mapElement, that._elements.noscript);
            }

            that._elements.noscript.parentNode.removeChild(that._elements.noscript);
            if (that._elements.container.matches(selectors.image)) {
                that._elements.image = that._elements.container;
            } else {
                that._elements.image = that._elements.container.querySelector(selectors.image);
            }

            that._elements.map = that._elements.container.querySelector(selectors.map);
            that._elements.areas = that._elements.container.querySelectorAll(selectors.area);
        }

        function removeLazyLoader() {
            that._elements.image.classList.remove(lazyLoader.cssClass);
            for (var property in lazyLoader.style) {
                if (Object.prototype.hasOwnProperty.call(lazyLoader.style, property)) {
                    that._elements.image.style[property] = "";
                }
            }
            that._elements.image.removeEventListener("load", removeLazyLoader);
            that._lazyLoaderShowing = false;
        }

        function isLazyVisible() {
            if (that._elements.container.offsetParent === null) {
                return false;
            }

            var wt = window.pageYOffset;
            var wb = wt + document.documentElement.clientHeight;
            var et = that._elements.container.getBoundingClientRect().top + wt;
            var eb = et + that._elements.container.clientHeight;

            return eb >= wt - that._properties.lazythreshold && et <= wb + that._properties.lazythreshold;
        }

        function resizeAreas() {
            if (that._elements.areas && that._elements.areas.length > 0) {
                for (var i = 0; i < that._elements.areas.length; i++) {
                    var width = that._elements.image.width;
                    var height = that._elements.image.height;

                    if (width && height) {
                        var relcoords = that._elements.areas[i].dataset.cmpRelcoords;
                        if (relcoords) {
                            var relativeCoordinates = relcoords.split(",");
                            var coordinates = new Array(relativeCoordinates.length);

                            for (var j = 0; j < coordinates.length; j++) {
                                if (j % 2 === 0) {
                                    coordinates[j] = parseInt(relativeCoordinates[j] * width);
                                } else {
                                    coordinates[j] = parseInt(relativeCoordinates[j] * height);
                                }
                            }

                            that._elements.areas[i].coords = coordinates;
                        }
                    }
                }
            }
        }

        function cacheElements(wrapper) {
            that._elements = {};
            that._elements.self = wrapper;
            var hooks = that._elements.self.querySelectorAll("[data-" + NS + "-hook-" + IS + "]");

            for (var i = 0; i < hooks.length; i++) {
                var hook = hooks[i];
                var capitalized = IS;
                capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
                var key = hook.dataset[NS + "Hook" + capitalized];
                that._elements[key] = hook;
            }
        }

        function onWindowResize() {
            that.update();
            resizeAreas();
        }

        function onLoad() {
            resizeAreas();
        }

        that.update = function() {
            if (that._properties.lazy) {
                if (isLazyVisible()) {
                    loadImage();
                }
            } else {
                loadImage();
            }
        };

        if (config && config.element) {
            init(config);
        }
    }

    function onDocumentReady() {
        var elements = document.querySelectorAll(selectors.self);
        for (var i = 0; i < elements.length; i++) {
            new Image({ element: elements[i], options: CMP.utils.readData(elements[i], IS) });
        }

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
        var body             = document.querySelector("body");
        var observer         = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // needed for IE
                var nodesArray = [].slice.call(mutation.addedNodes);
                if (nodesArray.length > 0) {
                    nodesArray.forEach(function(addedNode) {
                        if (addedNode.querySelectorAll) {
                            var elementsArray = [].slice.call(addedNode.querySelectorAll(selectors.self));
                            elementsArray.forEach(function(element) {
                                new Image({ element: element, options: CMP.utils.readData(element, IS) });
                            });
                        }
                    });
                }
            });
        });

        observer.observe(body, {
            subtree: true,
            childList: true,
            characterData: true
        });
    }

    var documentReady = document.readyState !== "loading" ? Promise.resolve() : new Promise(function(resolve) {
        document.addEventListener("DOMContentLoaded", resolve);
    });

    Promise.all([documentReady]).then(onDocumentReady);
    /*
        on drag & drop of the component into a parsys, noscript's content will be escaped multiple times by the editor which creates
        the DOM for editing; the HTML parser cannot be used here due to the multiple escaping
     */
    function decodeNoscript(text) {
        text = text.replace(/&(amp;)*lt;/g, "<");
        text = text.replace(/&(amp;)*gt;/g, ">");
        return text;
    }

})();

/*******************************************************************************
 * Copyright 2017 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function() {
    "use strict";

    var NS = "cmp";
    var IS = "search";

    var DELAY = 300; // time before fetching new results when the user is typing a search string
    var LOADING_DISPLAY_DELAY = 300; // minimum time during which the loading indicator is displayed
    var PARAM_RESULTS_OFFSET = "resultsOffset";

    var keyCodes = {
        TAB: 9,
        ENTER: 13,
        ESCAPE: 27,
        ARROW_UP: 38,
        ARROW_DOWN: 40
    };

    var selectors = {
        self: "[data-" + NS + '-is="' + IS + '"]',
        item: {
            self: "[data-" + NS + "-hook-" + IS + '="item"]',
            title: "[data-" + NS + "-hook-" + IS + '="itemTitle"]',
            focused: "." + NS + "-search__item--is-focused"
        }
    };

    var properties = {
        /**
         * The minimum required length of the search term before results are fetched.
         *
         * @memberof Search
         * @type {Number}
         * @default 3
         */
        minLength: {
            "default": 3,
            transform: function(value) {
                value = parseFloat(value);
                return isNaN(value) ? null : value;
            }
        },
        /**
         * The maximal number of results fetched by a search request.
         *
         * @memberof Search
         * @type {Number}
         * @default 10
         */
        resultsSize: {
            "default": 10,
            transform: function(value) {
                value = parseFloat(value);
                return isNaN(value) ? null : value;
            }
        }
    };

    var idCount = 0;

    function readData(element) {
        var data = element.dataset;
        var options = [];
        var capitalized = IS;
        capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
        var reserved = ["is", "hook" + capitalized];

        for (var key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                var value = data[key];

                if (key.indexOf(NS) === 0) {
                    key = key.slice(NS.length);
                    key = key.charAt(0).toLowerCase() + key.substring(1);

                    if (reserved.indexOf(key) === -1) {
                        options[key] = value;
                    }
                }
            }
        }

        return options;
    }

    function toggleShow(element, show) {
        if (element) {
            if (show !== false) {
                element.style.display = "block";
                element.setAttribute("aria-hidden", false);
            } else {
                element.style.display = "none";
                element.setAttribute("aria-hidden", true);
            }
        }
    }

    function serialize(form) {
        var query = [];
        if (form && form.elements) {
            for (var i = 0; i < form.elements.length; i++) {
                var node = form.elements[i];
                if (!node.disabled && node.name) {
                    var param = [node.name, encodeURIComponent(node.value)];
                    query.push(param.join("="));
                }
            }
        }
        return query.join("&");
    }

    function mark(node, regex) {
        if (!node || !regex) {
            return;
        }

        // text nodes
        if (node.nodeType === 3) {
            var nodeValue = node.nodeValue;
            var match = regex.exec(nodeValue);

            if (nodeValue && match) {
                var element = document.createElement("mark");
                element.className = NS + "-search__item-mark";
                element.appendChild(document.createTextNode(match[0]));

                var after = node.splitText(match.index);
                after.nodeValue = after.nodeValue.substring(match[0].length);
                node.parentNode.insertBefore(element, after);
            }
        } else if (node.hasChildNodes()) {
            for (var i = 0; i < node.childNodes.length; i++) {
                // recurse
                mark(node.childNodes[i], regex);
            }
        }
    }

    function Search(config) {
        if (config.element) {
            // prevents multiple initialization
            config.element.removeAttribute("data-" + NS + "-is");
        }

        this._cacheElements(config.element);
        this._setupProperties(config.options);

        this._action = this._elements.form.getAttribute("action");
        this._resultsOffset = 0;
        this._hasMoreResults = true;

        this._elements.input.addEventListener("input", this._onInput.bind(this));
        this._elements.input.addEventListener("focus", this._onInput.bind(this));
        this._elements.input.addEventListener("keydown", this._onKeydown.bind(this));
        this._elements.clear.addEventListener("click", this._onClearClick.bind(this));
        document.addEventListener("click", this._onDocumentClick.bind(this));
        this._elements.results.addEventListener("scroll", this._onScroll.bind(this));

        this._makeAccessible();
    }

    Search.prototype._displayResults = function() {
        if (this._elements.input.value.length === 0) {
            toggleShow(this._elements.clear, false);
            this._cancelResults();
        } else if (this._elements.input.value.length < this._properties.minLength) {
            toggleShow(this._elements.clear, true);
        } else {
            this._updateResults();
            toggleShow(this._elements.clear, true);
        }
    };

    Search.prototype._onScroll = function(event) {
        // fetch new results when the results to be scrolled down are less than the visible results
        if (this._elements.results.scrollTop + 2 * this._elements.results.clientHeight >= this._elements.results.scrollHeight) {
            this._resultsOffset += this._properties.resultsSize;
            this._displayResults();
        }
    };

    Search.prototype._onInput = function(event) {
        var self = this;
        self._cancelResults();
        // start searching when the search term reaches the minimum length
        this._timeout = setTimeout(function() {
            self._displayResults();
        }, DELAY);
    };

    Search.prototype._onKeydown = function(event) {
        var self = this;

        switch (event.keyCode) {
            case keyCodes.TAB:
                if (self._resultsOpen()) {
                    toggleShow(self._elements.results, false);
                    self._elements.input.setAttribute("aria-expanded", "false");
                }
                break;
            case keyCodes.ENTER:
                event.preventDefault();
                if (self._resultsOpen()) {
                    var focused = self._elements.results.querySelector(selectors.item.focused);
                    if (focused) {
                        focused.click();
                    }
                }
                break;
            case keyCodes.ESCAPE:
                self._cancelResults();
                break;
            case keyCodes.ARROW_UP:
                if (self._resultsOpen()) {
                    event.preventDefault();
                    self._stepResultFocus(true);
                }
                break;
            case keyCodes.ARROW_DOWN:
                if (self._resultsOpen()) {
                    event.preventDefault();
                    self._stepResultFocus();
                } else {
                    // test the input and if necessary fetch and display the results
                    self._onInput();
                }
                break;
            default:
                return;
        }
    };

    Search.prototype._onClearClick = function(event) {
        event.preventDefault();
        this._elements.input.value = "";
        toggleShow(this._elements.clear, false);
        toggleShow(this._elements.results, false);
        this._elements.input.setAttribute("aria-expanded", "false");
    };

    Search.prototype._onDocumentClick = function(event) {
        var inputContainsTarget =  this._elements.input.contains(event.target);
        var resultsContainTarget = this._elements.results.contains(event.target);

        if (!(inputContainsTarget || resultsContainTarget)) {
            toggleShow(this._elements.results, false);
            this._elements.input.setAttribute("aria-expanded", "false");
        }
    };

    Search.prototype._resultsOpen = function() {
        return this._elements.results.style.display !== "none";
    };

    Search.prototype._makeAccessible = function() {
        var id = NS + "-search-results-" + idCount;
        this._elements.input.setAttribute("aria-owns", id);
        this._elements.results.id = id;
        idCount++;
    };

    Search.prototype._generateItems = function(data, results) {
        var self = this;

        data.forEach(function(item) {
            var el = document.createElement("span");
            el.innerHTML = self._elements.itemTemplate.innerHTML;
            el.querySelectorAll(selectors.item.title)[0].appendChild(document.createTextNode(item.title));
            el.querySelectorAll(selectors.item.self)[0].setAttribute("href", item.url);
            results.innerHTML += el.innerHTML;
        });
    };

    Search.prototype._markResults = function() {
        var nodeList = this._elements.results.querySelectorAll(selectors.item.self);
        var escapedTerm = this._elements.input.value.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
        var regex = new RegExp("(" + escapedTerm + ")", "gi");

        for (var i = this._resultsOffset - 1; i < nodeList.length; ++i) {
            var result = nodeList[i];
            mark(result, regex);
        }
    };

    Search.prototype._stepResultFocus = function(reverse) {
        var results = this._elements.results.querySelectorAll(selectors.item.self);
        var focused = this._elements.results.querySelector(selectors.item.focused);
        var newFocused;
        var index = Array.prototype.indexOf.call(results, focused);
        var focusedCssClass = NS + "-search__item--is-focused";

        if (results.length > 0) {

            if (!reverse) {
                // highlight the next result
                if (index < 0) {
                    results[0].classList.add(focusedCssClass);
                    results[0].setAttribute("aria-selected", "true");
                } else if (index + 1 < results.length) {
                    results[index].classList.remove(focusedCssClass);
                    results[index].setAttribute("aria-selected", "false");
                    results[index + 1].classList.add(focusedCssClass);
                    results[index + 1].setAttribute("aria-selected", "true");
                }

                // if the last visible result is partially hidden, scroll up until it's completely visible
                newFocused = this._elements.results.querySelector(selectors.item.focused);
                if (newFocused) {
                    var bottomHiddenHeight = newFocused.offsetTop + newFocused.offsetHeight - this._elements.results.scrollTop - this._elements.results.clientHeight;
                    if (bottomHiddenHeight > 0) {
                        this._elements.results.scrollTop += bottomHiddenHeight;
                    } else {
                        this._onScroll();
                    }
                }

            } else {
                // highlight the previous result
                if (index >= 1) {
                    results[index].classList.remove(focusedCssClass);
                    results[index].setAttribute("aria-selected", "false");
                    results[index - 1].classList.add(focusedCssClass);
                    results[index - 1].setAttribute("aria-selected", "true");
                }

                // if the first visible result is partially hidden, scroll down until it's completely visible
                newFocused = this._elements.results.querySelector(selectors.item.focused);
                if (newFocused) {
                    var topHiddenHeight = this._elements.results.scrollTop - newFocused.offsetTop;
                    if (topHiddenHeight > 0) {
                        this._elements.results.scrollTop -= topHiddenHeight;
                    }
                }
            }
        }
    };

    Search.prototype._updateResults = function() {
        var self = this;
        if (self._hasMoreResults) {
            var request = new XMLHttpRequest();
            var url = self._action + "?" + serialize(self._elements.form) + "&" + PARAM_RESULTS_OFFSET + "=" + self._resultsOffset;

            request.open("GET", url, true);
            request.onload = function() {
                // when the results are loaded: hide the loading indicator and display the search icon after a minimum period
                setTimeout(function() {
                    toggleShow(self._elements.loadingIndicator, false);
                    toggleShow(self._elements.icon, true);
                }, LOADING_DISPLAY_DELAY);
                if (request.status >= 200 && request.status < 400) {
                    // success status
                    var data = JSON.parse(request.responseText);
                    if (data.length > 0) {
                        self._generateItems(data, self._elements.results);
                        self._markResults();
                        toggleShow(self._elements.results, true);
                        self._elements.input.setAttribute("aria-expanded", "true");
                    } else {
                        self._hasMoreResults = false;
                    }
                    // the total number of results is not a multiple of the fetched results:
                    // -> we reached the end of the query
                    if (self._elements.results.querySelectorAll(selectors.item.self).length % self._properties.resultsSize > 0) {
                        self._hasMoreResults = false;
                    }
                } else {
                    // error status
                }
            };
            // when the results are loading: display the loading indicator and hide the search icon
            toggleShow(self._elements.loadingIndicator, true);
            toggleShow(self._elements.icon, false);
            request.send();
        }
    };

    Search.prototype._cancelResults = function() {
        clearTimeout(this._timeout);
        this._elements.results.scrollTop = 0;
        this._resultsOffset = 0;
        this._hasMoreResults = true;
        this._elements.results.innerHTML = "";
        this._elements.input.setAttribute("aria-expanded", "false");
    };

    Search.prototype._cacheElements = function(wrapper) {
        this._elements = {};
        this._elements.self = wrapper;
        var hooks = this._elements.self.querySelectorAll("[data-" + NS + "-hook-" + IS + "]");

        for (var i = 0; i < hooks.length; i++) {
            var hook = hooks[i];
            var capitalized = IS;
            capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
            var key = hook.dataset[NS + "Hook" + capitalized];
            this._elements[key] = hook;
        }
    };

    Search.prototype._setupProperties = function(options) {
        this._properties = {};

        for (var key in properties) {
            if (Object.prototype.hasOwnProperty.call(properties, key)) {
                var property = properties[key];
                if (options && options[key] != null) {
                    if (property && typeof property.transform === "function") {
                        this._properties[key] = property.transform(options[key]);
                    } else {
                        this._properties[key] = options[key];
                    }
                } else {
                    this._properties[key] = properties[key]["default"];
                }
            }
        }
    };

    function onDocumentReady() {
        var elements = document.querySelectorAll(selectors.self);
        for (var i = 0; i < elements.length; i++) {
            new Search({ element: elements[i], options: readData(elements[i]) });
        }

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
        var body = document.querySelector("body");
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // needed for IE
                var nodesArray = [].slice.call(mutation.addedNodes);
                if (nodesArray.length > 0) {
                    nodesArray.forEach(function(addedNode) {
                        if (addedNode.querySelectorAll) {
                            var elementsArray = [].slice.call(addedNode.querySelectorAll(selectors.self));
                            elementsArray.forEach(function(element) {
                                new Search({ element: element, options: readData(element) });
                            });
                        }
                    });
                }
            });
        });

        observer.observe(body, {
            subtree: true,
            childList: true,
            characterData: true
        });
    }

    if (document.readyState !== "loading") {
        onDocumentReady();
    } else {
        document.addEventListener("DOMContentLoaded", onDocumentReady);
    }

})();

/*******************************************************************************
 * Copyright 2016 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function() {
    "use strict";

    var NS = "cmp";
    var IS = "formText";
    var IS_DASH = "form-text";

    var selectors = {
        self: "[data-" + NS + '-is="' + IS + '"]'
    };

    var properties = {
        /**
         * A validation message to display if there is a type mismatch between the user input and expected input.
         *
         * @type {String}
         */
        constraintMessage: "",
        /**
         * A validation message to display if no input is supplied, but input is expected for the field.
         *
         * @type {String}
         */
        requiredMessage: ""
    };

    function readData(element) {
        var data = element.dataset;
        var options = [];
        var capitalized = IS;
        capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
        var reserved = ["is", "hook" + capitalized];

        for (var key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                var value = data[key];

                if (key.indexOf(NS) === 0) {
                    key = key.slice(NS.length);
                    key = key.charAt(0).toLowerCase() + key.substring(1);

                    if (reserved.indexOf(key) === -1) {
                        options[key] = value;
                    }
                }
            }
        }

        return options;
    }

    function FormText(config) {
        if (config.element) {
            // prevents multiple initialization
            config.element.removeAttribute("data-" + NS + "-is");
        }

        this._cacheElements(config.element);
        this._setupProperties(config.options);

        this._elements.input.addEventListener("invalid", this._onInvalid.bind(this));
        this._elements.input.addEventListener("input", this._onInput.bind(this));
    }

    FormText.prototype._onInvalid = function(event) {
        event.target.setCustomValidity("");
        if (event.target.validity.typeMismatch) {
            if (this._properties.constraintMessage) {
                event.target.setCustomValidity(this._properties.constraintMessage);
            }
        } else if (event.target.validity.valueMissing) {
            if (this._properties.requiredMessage) {
                event.target.setCustomValidity(this._properties.requiredMessage);
            }
        }
    };

    FormText.prototype._onInput = function(event) {
        event.target.setCustomValidity("");
    };

    FormText.prototype._cacheElements = function(wrapper) {
        this._elements = {};
        this._elements.self = wrapper;
        var hooks = this._elements.self.querySelectorAll("[data-" + NS + "-hook-" + IS_DASH + "]");
        for (var i = 0; i < hooks.length; i++) {
            var hook = hooks[i];
            var capitalized = IS;
            capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
            var key = hook.dataset[NS + "Hook" + capitalized];
            this._elements[key] = hook;
        }
    };

    FormText.prototype._setupProperties = function(options) {
        this._properties = {};

        for (var key in properties) {
            if (Object.prototype.hasOwnProperty.call(properties, key)) {
                var property = properties[key];
                if (options && options[key] != null) {
                    if (property && typeof property.transform === "function") {
                        this._properties[key] = property.transform(options[key]);
                    } else {
                        this._properties[key] = options[key];
                    }
                } else {
                    this._properties[key] = properties[key]["default"];
                }
            }
        }
    };

    function onDocumentReady() {
        var elements = document.querySelectorAll(selectors.self);
        for (var i = 0; i < elements.length; i++) {
            new FormText({ element: elements[i], options: readData(elements[i]) });
        }

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
        var body = document.querySelector("body");
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // needed for IE
                var nodesArray = [].slice.call(mutation.addedNodes);
                if (nodesArray.length > 0) {
                    nodesArray.forEach(function(addedNode) {
                        if (addedNode.querySelectorAll) {
                            var elementsArray = [].slice.call(addedNode.querySelectorAll(selectors.self));
                            elementsArray.forEach(function(element) {
                                new FormText({ element: element, options: readData(element) });
                            });
                        }
                    });
                }
            });
        });

        observer.observe(body, {
            subtree: true,
            childList: true,
            characterData: true
        });
    }

    if (document.readyState !== "loading") {
        onDocumentReady();
    } else {
        document.addEventListener("DOMContentLoaded", onDocumentReady);
    }

})();

'use strict';

//---------------------------------------
window.LocatorUtils = ( () => {
  const SEARCH_FORM_SESSION_KEY = 'tgsParams';
  const RESULT_LIST_SESSION_KEY = 'balResultParams';
  const PR = ( globalThis.PositionResolver ? PositionResolver() : {} );

  const _private = {
    saveParamsToSession: ( key, params = {}, overlay = false ) => {
      const PARAMS = {
        ...( overlay ? _private.getParamsFromSession( key ) : {} ),
        ...params,
        updated: ( new Date() ).toISOString()
      };

      try {
        sessionStorage.setItem( key, JSON.stringify( PARAMS ) );
      }
      catch ( err ) {
        console.error( err );
      }
    },

    getParamsFromSession: ( key, defaultParams = {} ) => {
      try {
        return ( JSON.parse( sessionStorage.getItem( key ) ) || defaultParams );
      }
      catch ( err ) {
        console.warn( err );
        return defaultParams;
      }
    },

    updateSessionSearchOrigin: async pd => {
      // Rest assured, the following is *temporary* madness -- we'll have a much cleaner
      // positionData class implementation available when rebuilding Locator in ui.frontend.
      try {
        const [ { latlng: LATLNG }, { textAddress: TEXT_ADDRESS, textAddressParts: TEXT_ADDRESS_PARTS } ] =
          await Promise.all( [ pd.latlngPromise, pd.textAddressPromise ] );

        const PARAMS = {
          latlng:      [ LATLNG.toString() ],
          textAddress: [ TEXT_ADDRESS      ],
          state:       arrayMe( TEXT_ADDRESS_PARTS?.administrative_area_level_1 ),
          city:        arrayMe( TEXT_ADDRESS_PARTS?.locality                    ),
          zip:         arrayMe( TEXT_ADDRESS_PARTS?.postal_code                 ),
        };

        _private.saveParamsToSession( SEARCH_FORM_SESSION_KEY, PARAMS, true );
      }
      catch ( err ) {
        console.warn( err );
      }

      function arrayMe( txt ) { return ( txt ? [ txt ] : undefined ) }
    },

    getAugmentedPD: ( input, moreInput ) => {
      const PD = PR.getPositionData( input );

      // See comment in updateSessionSearchOrigin method above -- applies here too...
      const TEXT_ADDRESS_PARTS = ( () => {
        const REDUCER = ( ( acc, cur ) => ( ( acc[ cur.types?.[0] ] = cur.short_name ), acc ) );

        switch ( true ) {
          case ( moreInput instanceof Array ):    return moreInput.reduce( REDUCER, {} );
          case ( typeof moreInput === 'object' ): return moreInput;
          default:                                return {};
        }
      } )();

      PD.textAddressPromise = PD.textAddressPromise.then( obj => ( {
        textAddressParts: TEXT_ADDRESS_PARTS,
        ...obj,
        textAddress: _private.ncfom( obj.textAddress )
      } ) );

      return PD;
    },

    ncfom: ( text = '' ) => text.replace( /,\s*usa?\b/i, '' ),

    scrubLocationObject: ( () => {
      const PROTOCOL = ( /\b(Mac|iPhone)\s+OS\b/i.test( navigator.userAgent ) ? 'maps:' : 'https:' );
      const MAPS_URL = new URL( `${PROTOCOL}//maps.google.com/maps` );

      return ( ( location = {}, searchOriginAddress = '' ) => {
        const LOC = structuredClone( location );
        LOC.href = LOC.url;   // ...just for clarity/convenience when we want distinguish URL object from its corresponding string representation (href)
        LOC.isBranch = /^branch$/i.test( LOC.locationType );
        LOC.isATM    =    /^atm$/i.test( LOC.locationType );
        LOC.hasATM = ( LOC.isBranch && !!LOC.atmDetail?.length );

        LOC.displayType = `${LOC.locationType}${ LOC.hasATM ? '/ATM' : '' }`;
        LOC.displayName = `${TextFormatUtils.format( LOC.locationName, 'title' ) } ${LOC.displayType}`;
        LOC.phone = LOC.phone?.replace( /\D+/g, '-' )?.replace( /^-|-$/g, '' );

        const LOC_ADDR = LOC.locationAddress;
        LOC_ADDR.streetAddress1 = TextFormatUtils.format( LOC_ADDR.address1, 'streetAddress' );
        LOC_ADDR.streetAddress2 = TextFormatUtils.format( LOC_ADDR.address2, 'streetAddress' );

        LOC_ADDR.fullStreetAddress = LOC_ADDR.streetAddress1 +
          ( ( LOC_ADDR.address2 && LOC.isATM ) ? `\n${LOC_ADDR.streetAddress2}` : '' );

        LOC_ADDR.city = TextFormatUtils.format( LOC_ADDR.city, 'title' );
        LOC_ADDR.zipCode = LOC_ADDR.zipCode?.replace( /-0000$/, '' );  // remove placeholder zip+4, iff present
        LOC_ADDR.zipLine = `${LOC_ADDR.city}, ${LOC_ADDR.state}  ${LOC_ADDR.zipCode}`;
        LOC_ADDR.markerTitle = `${LOC.displayName}\n${LOC_ADDR.fullStreetAddress}\n${LOC_ADDR.zipLine}`;

        if ( searchOriginAddress ) {
          MAPS_URL.searchParams.set( 'saddr', searchOriginAddress );
          MAPS_URL.searchParams.set( 'daddr', `${LOC_ADDR.streetAddress1}, ${LOC_ADDR.zipLine}` );
          LOC_ADDR.directionsHref = MAPS_URL.href;
        }

        const MAKE_APPT_PARAMS = new URLSearchParams();
        MAKE_APPT_PARAMS.set( 'branchId',  LOC.branchId     );
        MAKE_APPT_PARAMS.set( 'latitude',  LOC_ADDR.lat     );
        MAKE_APPT_PARAMS.set( 'Longitude', LOC_ADDR['long'] );
        LOC.makeApptQueryString = `?${MAKE_APPT_PARAMS.toString()}`;

        return [ LOC, LOC_ADDR ];
      } );
    } )(),

    openGetDirectionsModal: ( () => {
      let $modal, $outboundLink;

      return ( ev => {
        const $ME = $( ev.target );
        $modal        || ( $modal        = $( $ME.data( 'modalTarget' ) )                 );
        $outboundLink || ( $outboundLink = $modal.find( '.modal-foot .btnModal' ).first() );
        if ( !$outboundLink.length ) return true;  // couldn't find a correctly configured modal component, so allow default behavior for the trigger element

        $outboundLink.attr( 'href', $ME.data( 'externalHref' ) );
        $modal.modal( 'show' );
        return false;
      } );
    } )(),

    openStatusModal: ( () => {
      let $modal;

      return ( ev => {
        if ( !$modal ) {
          $modal = $( 'div.js-location-status-msg' );   // TODO: pass $cmp reference to LocationUtils, so we can narrow scope of this .find()
          CommonUtils.initClickChain( $modal, '', ev => ev.stopPropagation() );
          CommonUtils.initClickChain( $modal, '.closed-popup-close-icon', () => $( document ).click() );
        }

        ev.preventDefault();
        ev.stopPropagation();
        let $me = $( ev.currentTarget );
        let status = $me.find( 'span:visible' ).first().data( 'status' );

        $modal.find( '[data-status]' ).each( ( i, elm ) => {
          let $mine = $( elm );
          $mine.toggleClass( 'hide', $mine.data( 'status' ) != status );
        } );

        $modal.attr( { 'aria-live': 'polite', 'role': 'dialog' } ).removeClass( 'hide' );
        $modal.find( '.close-icon-popup' ).attr( 'tabindex', 0 ).css( 'border', '1px solid outline' ).focus();

        CommonUtils.initClickChain( document, '', () => {
          $modal.addClass( 'hide' ).removeAttr( 'aria-live role' );
          $( document ).off( 'click keydown' );
        } );
      } )
    } )(),

    autoScroll: $cmp => {
      history.scrollRestoration = 'manual';
      const AUTO_SCROLL = _private.getParamsFromSession( RESULT_LIST_SESSION_KEY ).autoScroll;

      if ( AUTO_SCROLL ) {
        const FILTER = ( ( i, elem ) => {
          const $CONTENT = $( elem ).contents();
          return ( $CONTENT.length === 1 ) && ( $CONTENT.get(0).nodeType == Node.TEXT_NODE );
        } )

        const $TRG = $cmp.find( ':visible' ).addBack().filter( FILTER ).first();  // first visible element (within component) containing only text
        CommonUtils.rollTo( $TRG, parseInt( $TRG.css( 'margin-top' ) ) + parseInt( $TRG.css( 'padding-top' ) ) );
      }

      _private.saveParamsToSession( RESULT_LIST_SESSION_KEY, { autoScroll: true }, true );
    }
  };

  return {
    SEARCH_FORM_SESSION_KEY: SEARCH_FORM_SESSION_KEY,
    RESULT_LIST_SESSION_KEY: RESULT_LIST_SESSION_KEY,
    saveParamsToSession: _private.saveParamsToSession,
    getParamsFromSession: _private.getParamsFromSession,
    updateSessionSearchOrigin: _private.updateSessionSearchOrigin,
    getAugmentedPD: _private.getAugmentedPD,
    ncfom: _private.ncfom,

    scrubLocationObject: _private.scrubLocationObject,
    openGetDirectionsModal: _private.openGetDirectionsModal,
    openStatusModal: _private.openStatusModal,
    autoScroll: _private.autoScroll
  };
} )();

//---------------------------------------
$( document ).ready( () => {
  const $AC_CONTAINER = $( 'form.google-search-form' ).first();

  switch ( true ) {
    case ( $( '.branch-locator-component' ).children().length > 0 ): return Locator.init();
    case ( $( '.branch-detail-component'  ).children().length > 0 ): return LocatorDetail.init();
    case ( $AC_CONTAINER.length > 0 ): LocatorAutocomplete.init( { $container: $AC_CONTAINER } );
  }
} );

'use strict';

window.LocatorAutocomplete = ( () => {
  const SETTINGS = { footprint: {}, callback: $.noop };
  const STATUS = {};

  const GOOGLE_COMPONENT_RESTRICTIONS = { 'country': 'us' };
  const REGION_TYPES = [ '(regions)' ];
  const ADDRESS_TYPES = [ 'address' ];
  const GEOCODE_TYPES = [ 'geocode' ];
  const TYPEAHEAD_LIMIT = 5;

  let positionData;
  let $ac, $acForm, $cloners, $searchButton, $xButton;
  let acsToken;
  let prevQuery, prevPredictions;

  const _private = {
    //---------------------------------------
    init: async ( so = {} ) => {
      await LibLoader.get( {
        uri: '/etc.clientlibs/stcom-aem-globalcomponents/clientlibs/clientlib-search-utils.js',
        verifier: () => ( !!$.fn.typeahead && !!Bloodhound )
      } );

      Object.assign( SETTINGS, so );
      $acForm = SETTINGS.$container;
      $cloners = $acForm.find( 'div.cloners' );

      // Custom autocomplete:
      $ac = $acForm.find( '#autocomplete' );
      let $acNextAll = $ac.nextAll();

      $ac.typeahead( {}, {
          source: _private.typeaheadSource,
          limit: Number.MAX_SAFE_INTEGER,   // "limit" setting doesn't work as advertised with typeahead, so we apply the real limit elsewhere
          display: 'description',
          templates: {
            header: $cloners.find( 'div.header-template' ).html(),
            suggestion: data => data.suggestion
          }
        } )
        .on( 'typeahead:change', _private.handleTypeaheadChange )
        .on( 'typeahead:select', _private.handleTypeaheadSelect )
        .on( 'keydown', _private.handleTypeaheadKeydown )
        .on( 'input', _private.handleTypeaheadInput )
        .after( $acNextAll )
        .parent().find( 'div.tt-menu' ).attr( 'id', 'tt-menu' );

      // More objects and event bindings:
      SETTINGS.locatorPagePath = $acForm.attr( 'action' );  // preserve default path before we overwrite it
      $acForm.attr( 'action', window.location.pathname );

      $searchButton = $acForm.find( 'button.google-search-button' ).first()
        .on( 'click', () => STATUS.searchButtonClick = true );

      SETTINGS.relayParams?.forEach( ( val, key ) => {
        const $INPUT = $( '<input type="hidden"/>' );
        $INPUT.attr( 'name', key );
        $INPUT.val( val );
        $acForm.prepend( $INPUT );
      } );

      $acForm.find( 'label.placeholder' ).on( 'click:a11y', () => $ac.focus() );
      $acForm.on( 'submit', _private.handleSubmit );

      let $geoLocationButton = $acForm.find( '.bg-svg' );
      navigator.geolocation || $geoLocationButton.hide();
      $geoLocationButton.on( 'click:a11y', _private.handleGeoLocationClick );

      $xButton = $acForm.find( '.locator-search-close-icon' );
      $xButton.on( 'click:a11y', () => ( $ac.typeahead( 'val', '' ).focus(), _private.handleTypeaheadInput(), false ) );

      await _private.safeUpdate( SETTINGS.positionData );
    },

    //---------------------------------------
    typeaheadSource: ( () => {
      let acs, suggestionTemplate;

      return ( query = '', syncHandler, asyncHandler ) => {
        if ( prevQuery && ( query.indexOf( prevQuery ) == 0 ) ) {
          syncHandler( prevPredictions );
          return;
        }

        prevQuery = undefined;
        prevPredictions = undefined;

        let typeList = ( /^[\d\-]+$/.test( query ) ?
          [ REGION_TYPES, ADDRESS_TYPES ] :   // if it might be a zip code, we'll check regions before addresses
          [ GEOCODE_TYPES ]                   // otherwise, could be anything
        );

        !acs && ( acs = new google.maps.places.AutocompleteService() );
        !acsToken && ( acsToken = new google.maps.places.AutocompleteSessionToken() );
        !suggestionTemplate && ( suggestionTemplate = $cloners.find( 'div.suggestion-template' ).html() );
        getPredictions();

        //-----------------------------------
        function getPredictions( acc = [] ) {
          $ac.attr('aria-describedby','tt-menu');
          if ( ( typeList.length <= 0 ) || ( acc.length >= TYPEAHEAD_LIMIT ) ) {
            asyncHandler( acc.slice( 0, TYPEAHEAD_LIMIT ) );

            if ( acc.length <= 1 ) {
              prevQuery = query;
              prevPredictions = acc;
            }
          }
          else {
            const GPP_PARAMS = {
              input: query,
              types: typeList.shift(),
              componentRestrictions: GOOGLE_COMPONENT_RESTRICTIONS,
              sessionToken: acsToken
            };

            acs.getPlacePredictions( GPP_PARAMS ).then( resp => {
              const PREDICTIONS = ( resp.predictions || [] ).map( prediction => {
                let sf = prediction.structured_formatting;

                let suggestionParts = ( prediction.types.includes( 'postal_code' ) ?
                  [ '',           `${sf.secondary_text} `,  'main-text',  sf.main_text              ] :
                  [ 'main-text',  sf.main_text,             '',           `, ${sf.secondary_text}`  ]
                );

                prediction.description = LocatorUtils.ncfom( prediction.description );
                prediction.suggestion = LocatorUtils.ncfom( CommonUtils.fillTemplate( suggestionTemplate, suggestionParts ) );
                return prediction;
              } );

              getPredictions( acc.concat( PREDICTIONS ) );
            } );
          }
        }
      }
    } )(),

    handleTypeaheadChange: () => ( STATUS.needSubmit = true ),

    handleTypeaheadSelect: ( () => {
      let ps;

      return ( ev, data ) => {
        ps || ( ps = new google.maps.places.PlacesService( $( '<div/>' ).get(0) ) );
        _private.handleTypeaheadChange();

        ps.getDetails( {
          placeId: data.place_id,
          fields: [ 'geometry', 'address_components' ],
          sessionToken: acsToken
        }, _private.handlePlaceResult );

        acsToken = undefined;
      }
    } )(),

    handleTypeaheadKeydown: ( ev = new KeyboardEvent() ) => {
        switch ( ev.key ) {
        case "Enter":  // invoke simulated autocomplete (selection of top suggestion)
          $ac.removeAttr('aria-describedby');
          const $TOP = $ac.siblings( '.tt-open' ).find( '.tt-selectable' ).first();
          $TOP.length ? $TOP.click() : ( $ac.blur(), $acForm.submit() );
          return false;

        case "Tab":   // bypass autocomplete, move focus to next available button
          if ( !ev.shiftKey ) {
            $ac.removeAttr('aria-describedby');
            $ac.typeahead( 'val' ) ? $xButton.trigger( 'focus' ) : $acForm.find( '#show-filter' ).trigger( 'focus' );
            return false;
          }

        default:
          return true;
      }
    },

    handleTypeaheadInput: () => _private.enableSearchButton( !!$ac.typeahead( 'val' ) ),

    //---------------------------------------
    safeUpdate: async pd => {
      positionData = pd;

      await pd.textAddressPromise.then( obj => {
        $ac.typeahead( 'val', obj?.textAddress );
        prevQuery = obj?.textAddress;
        prevPredictions = undefined;
      } );
    },

    //---------------------------------------
    handleGeoLocationClick: () => {
      _private.handleTypeaheadChange();
      _private.checkFootprintState();   // this merely updates form action attribute, since we pass no input
      _private.safeUpdate( LocatorUtils.getAugmentedPD() );
      _private.handoff();
      return false;
    },

    //---------------------------------------
    handlePlaceResult: ( result, resultStatus ) => {
      switch ( resultStatus ) {
        case 'OK':
          const AC_PICK = result.address_components[0];
          const AC_PICK_ST = ( AC_PICK.types.includes( 'administrative_area_level_1' ) ? AC_PICK.short_name : '' );

          if ( !_private.checkFootprintState( AC_PICK_ST ) ) {
            const LL = result.geometry?.location;

            positionData = LocatorUtils.getAugmentedPD(
              { lat: LL?.lat(), lng: LL?.lng(), textAddress: $ac.typeahead( 'val' ) },
              result.address_components
            );
          }

          _private.handoff();
          return;

        case 'OVER_QUERY_LIMIT':
          console.error( resultStatus );
          return;

        default:
          _private.handleError( resultStatus );
      }
    },

    //---------------------------------------
    handleSubmit: () => {
       if ( STATUS.needSubmit ) {
         let locatorText = $ac.typeahead( 'val' ).trim().replace( /\s+/, ' ' );

        _private.checkFootprintState( locatorText ) ||
          _private.safeUpdate( LocatorUtils.getAugmentedPD( { textAddress: locatorText } ) );

        _private.handoff();
      }

      return false;
    },

    //---------------------------------------
    handleError: err => {
      console.error( err );
      const FALLBACK_PD_INPUT = { lat: 35.2270869, lng: -80.8431267, textAddress: 'Charlotte, NC' };
      _private.safeUpdate( LocatorUtils.getAugmentedPD( FALLBACK_PD_INPUT ) );
      _private.handoff();
    },

    //---------------------------------------
    checkFootprintState: ( text = '' ) => {
      const STATE_INFO = SETTINGS.footprint[ LocatorUtils.ncfom( text?.toUpperCase() ) ];

      $acForm.attr( 'action', ( STATE_INFO ?
        `/${SETTINGS.locationTypeDir}/${STATE_INFO.abbr.toLowerCase()}` :
        SETTINGS.locatorPagePath
      ) );

      return !!STATE_INFO;
    },

    //---------------------------------------
    handoff: () => {
      const USSO_PROMISE = LocatorUtils.updateSessionSearchOrigin( positionData );

      ( window.location.pathname !== $acForm.attr( 'action' ) ) ?     // need redirect?
        USSO_PROMISE.then( () => $acForm.off( 'submit' ).submit() ) :   // yes => have some!
        SETTINGS.callback( { ...positionData, ...STATUS } );            // no => invoke callback

      STATUS.needSubmit = false;
      STATUS.searchButtonClick = false;
    },

    //---------------------------------------
    activate: ( so = {} ) => {
      const NEED_UPDATE = Object.keys( so ).some( key => ( so[key] != SETTINGS[key] ) );  // check whether new settings will change anything
      NEED_UPDATE && Object.assign( SETTINGS, so );                                       // update current settings if so

      STATUS.needSubmit = ( STATUS.needSubmit || NEED_UPDATE );
      STATUS.needSubmit ? $acForm.submit() : _private.handoff();
    },

    enableSearchButton: ( enable = true ) => $searchButton?.prop( 'disabled', !enable )
  };

  const _public = {
    init: _private.init,
    activate: _private.activate,
    safeUpdate: _private.safeUpdate,
    enableSearchButton: _private.enableSearchButton
  };

  return _public;
} )();
'use strict';

window.LocationTimeTableParser = ( settings => {
  const SETTINGS = JSON.parse( JSON.stringify( settings ) );
  const CURRENT_WEEKDAY = ( new Date() ).toLocaleString( 'en-us', { weekday: 'short' } );

  const DAY_MAPPER = {
    Mon: 'Monday',
    Tue: 'Tuesday',
    Wed: 'Wednesday',
    Thu: 'Thursday',
    Fri: 'Friday',
    Sat: 'Saturday',
    Sun: 'Sunday'
  };

  let loc = {};
  let markups = {};
  let $statusLink;

  const _private = {
    //----------------------------------------
    setLocation: ( location = {} ) => {
      loc = location;
      markups = {};

      $statusLink = $(
        CommonUtils.fillTemplate( SETTINGS.statusLinkTemplate, [ loc.displayName ] ).replace( />\s*</g, '><' )
      );
    },

    //----------------------------------------
    getTodayScheduleMarkup: ( key, label ) => _private.formatTimeTable( key, label ).todaySchedule,
    getTimeTableMarkup: key => _private.formatTimeTable( key ).timeTable,

    //----------------------------------------
    formatTimeTable: ( key, label = '' ) => {
      if ( !markups[key] ) {
        let collapsibleTimetable, todaySched;

        if ( ( key === 'atmHours' ) && ( loc.isATM || loc.hasATM ) ) {  // temp work-around until API returns ATM schedules too
          const SCHEDULE = '24 hours';
          collapsibleTimetable = [ { days: [ 'Mon', 'Sun' ], schedule: SCHEDULE } ];
          todaySched = _private.getTodaySchedule( true, SCHEDULE );
        }
        else {
          collapsibleTimetable = loc[key]?.reduce( _private.parseInitialTimeTable, [] );
          todaySched = collapsibleTimetable?.todaySchedule;
        }

        const TS_MARKUP = ( todaySched ?
          CommonUtils.fillTemplate( SETTINGS.todayScheduleTemplate, [ todaySched.class, label, todaySched.markup] ) :
          ''
        );

        markups[key] = {
          todaySchedule: TS_MARKUP,
          timeTable: ( collapsibleTimetable?.map( _private.formatCollapsibleTimeTable ).join( '' ) || '' )
        }
      }

      return markups[key];
    },

    //----------------------------------------
    // Each call to this method parses one entry in a timetable provided with location data.
    // Generally, each entry corresponds to one day of the week, unless it's a single-entry ['24 hours'] table for ATM.
    // Return value from final iteration (over a given timetable) is a "collapsible" timetable,
    // meaning that days with matching schedules are combined into a single entry, where allowed.
    parseInitialTimeTable: ( collapsibleTimeTable, entry = '' ) => {
      const COLLAPSIBLE_DAYS = [ 'Mon', 'Tue', 'Wed', 'Thu' ];

      // Retrieve entry from most recent previous iteration:
      const PREV_ENTRY = collapsibleTimeTable.at( -1 );
      const PREV_ENTRY_DAYS = PREV_ENTRY?.days;
      const PREV_WEEKDAY = PREV_ENTRY_DAYS?.at( -1 );

      // Parse current entry:
      const ENTRY_PARTS = ( entry?.split( /^([a-z]+):/i ) || [] );
      const SCHEDULE_TEXT_PARTS             = ENTRY_PARTS.pop()?.split( '*' );
      const WEEKDAY = TextFormatUtils.format( ENTRY_PARTS.pop(), 'title' );

      const SCHEDULE_TEXT = TextFormatUtils.format(
        ( ( SCHEDULE_TEXT_PARTS?.shift() || '' ) + ( SCHEDULE_TEXT_PARTS?.pop() || '' ) )
          .replace( /^\W+/, '' )    // purge both leading and trailing non-word characters,
          .replace( /\W+$/, '' ),   // in a manner which pleases the SonarQube
        'title'
      );

      const SCHEDULE_BLOCKS = _private.getScheduleBlocks( SCHEDULE_TEXT );
      const SCHEDULE = ( _private.formatSchedule( SCHEDULE_BLOCKS ) || SCHEDULE_TEXT );

      // What shall we do with it?
      if ( SCHEDULE ) {
        // Combine with previous entry or create a new one:
        if ( ( SCHEDULE === PREV_ENTRY?.schedule ) &&
          COLLAPSIBLE_DAYS.includes( WEEKDAY ) &&
          COLLAPSIBLE_DAYS.includes( PREV_WEEKDAY )
        ) {
          PREV_ENTRY_DAYS.push( WEEKDAY )
        }
        else{
          collapsibleTimeTable.push( { days: Array( WEEKDAY ), schedule: SCHEDULE } );
        }

        // If this entry is for current weekday, create special entry based on real-time status info too:
        ( ( WEEKDAY || CURRENT_WEEKDAY ) === CURRENT_WEEKDAY ) &&
          ( collapsibleTimeTable.todaySchedule = _private.getTodaySchedule( false, SCHEDULE, SCHEDULE_BLOCKS ) );
      }

      return collapsibleTimeTable;
    },

    //----------------------------------------
    formatCollapsibleTimeTable: entry => {
      let dayLabel = entry.days.shift();
      let srDayLabel = DAY_MAPPER[dayLabel];

      if ( entry.days.length ) {
        const MORE_LABEL = entry.days.pop();
        dayLabel    += `&ndash;${MORE_LABEL}`;
        srDayLabel  += ` to ${DAY_MAPPER[MORE_LABEL]}`;
      }

      dayLabel && ( dayLabel += ':' ) && ( srDayLabel += ':' );
      return CommonUtils.fillTemplate( SETTINGS.timeTableEntryTemplate, [ dayLabel, srDayLabel, entry.schedule ] );
    },

    // -----------------------------------------
    getScheduleBlocks: ( scheduleText = '' ) => {
      const EARLIEST = 420;
      const TIMES = _private.parseTimes( scheduleText );
      const BLOCKS = [];

      while ( TIMES.length >= 2 ) {
        const OPEN  = TIMES.shift();
        const CLOSE = TIMES.shift();

        if ( !OPEN.meridian || !CLOSE.meridian ) {  // am/pm designation(s) missing, so we'll make a best guess...
          switch ( true ) {
            case ( OPEN.minutesPastMidnight >= CLOSE.minutesPastMidnight ):
              OPEN.meridian = 'am';
              CLOSE.meridian = 'pm';
              break;
            case ( OPEN.minutesPastMidnight >= EARLIEST ):
              OPEN.meridian = 'am';
              CLOSE.meridian = 'am';
              break;
            case ( OPEN.minutesPastMidnight < EARLIEST ):
              OPEN.meridian = 'pm';
              CLOSE.meridian = 'pm';
          }
        }

        BLOCKS.push( { open: OPEN, close: CLOSE } );
      }

      return BLOCKS;
    },

    // -----------------------------------------
    parseTimes: ( text = '' ) => {
      class timeOfDay {
        constructor( hr, min = ':00', mer = '' ) {
          this.hour = parseInt( hr );
          this.minute = parseInt( min?.replace( /^:/, '' ) );
          this.meridian = mer?.toLowerCase();
        }

        get minutesPastMidnight() { return ( this.hour%12 + ( ( this.meridian === 'pm' ) ? 12 : 0 ) )*60 + this.minute; }

        get displayText() { return `${this.hour}${this.minuteDisplayText()}&nbsp;${this.meridian}`; }

        minuteDisplayText() { return ( this.minute ? `:${this.minuteString()}` : '' ); }
        minuteString() { return `0${this.minute}`.slice(-2); }
      }

      const MATCHES = text?.matchAll( /(\d?\d)(:\d\d)?\s*([ap]m)?/gi );
      return ( MATCHES ? [ ...MATCHES ].map( parts => new timeOfDay( ...parts.slice(1) ) ) : [] );
    },

    // -----------------------------------------
    formatSchedule: ( blocks = [] ) =>
      blocks.map( block => `${block.open.displayText}&nbsp;&ndash;&nbsp;${block.close.displayText}` ).join( ', ' ),

    // -----------------------------------------
    getTodaySchedule: ( isATM, schedule = '', blocks = [] ) => {
      const ALTERED_SCHEDULE = ( isATM ?
        _private.getAlteredSchedule_ATM( loc.atmDetail ) :
        _private.getAlteredSchedule_Branch( blocks )
      );

      return ( ALTERED_SCHEDULE ?
        { class: 'location-schedule-alert', markup: ALTERED_SCHEDULE } :
        { class: '',                        markup: schedule         }
      );
    },

    // -----------------------------------------
    getAlteredSchedule_ATM: ( atmDetail = [] ) => {
      // Create a set comprised of distinct status flags from ATM(s) at given location:
      const LOCATION_FLAGS = atmDetail.reduce( _private.gatherAtmFlags, new Set() );
      ( LOCATION_FLAGS.size > 1 ) && LOCATION_FLAGS.delete( 'C' );  // ignore "closed" iff any ATM on site is NOT closed

      // Now collapse the set to a string, and match with status link label for display on the page:
      return _private.getStatusLinkMarkup( `atm-${[ ...LOCATION_FLAGS ].sort().join()}` );
    },

    // -----------------------------------------
    getAlteredSchedule_Branch: ( blocks = [] ) => {
      const ALT_OPEN  = _private.parseTimes( loc.branchStatusDetail?.openTime  ).shift();
      const ALT_CLOSE = _private.parseTimes( loc.branchStatusDetail?.closeTime ).shift();
      let alteredSchedule;

      if ( ALT_OPEN || ALT_CLOSE ) {
        const TODAY_BLOCKS = blocks.filter( block => (
          ( ALT_OPEN  ? ( ALT_OPEN.minutesPastMidnight   < block.close.minutesPastMidnight ) : true ) &&
          ( ALT_CLOSE ? ( block.open.minutesPastMidnight < ALT_CLOSE.minutesPastMidnight   ) : true )
        ) );

        if ( TODAY_BLOCKS.length ) {
          ALT_OPEN  && ( TODAY_BLOCKS.at(  0 ).open  = ALT_OPEN  );
          ALT_CLOSE && ( TODAY_BLOCKS.at( -1 ).close = ALT_CLOSE );
          alteredSchedule = _private.formatSchedule( TODAY_BLOCKS );
        }
      }

      return ( alteredSchedule ? alteredSchedule : _private.getStatusLinkMarkup( `branch-${loc.branchStatus}` ) );
    },

    // -----------------------------------------
    gatherAtmFlags: ( locationFlags, atm ) => {
      const ATM_FLAGS = ( ( atm.atmOpenClosedInd === 'O' ) ? atm.atmServiceAvailable : atm.atmOpenClosedInd );
      ATM_FLAGS?.split( ',' )?.forEach( flag => locationFlags.add( flag ) );
      return locationFlags;
    },

    // -----------------------------------------
    getStatusLinkMarkup: statusKey => {
      const $STATUS_LINK_LABEL = $statusLink.find( `span[data-status="${statusKey}"]` );

      if ( $STATUS_LINK_LABEL.length ) {
        $STATUS_LINK_LABEL.removeClass( 'hide' ).siblings( '[data-status]' ).addClass( 'hide' );
        return $statusLink.prop( 'outerHTML' );
      }

      return '';
    }
  };

  const _public = {
    setLocation: _private.setLocation,
    getTodayScheduleMarkup: _private.getTodayScheduleMarkup,
    getTimeTableMarkup: _private.getTimeTableMarkup
  };

  return _public;
} );

"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

var MarkerClusterer = function () {
  "use strict";

  var t = function t(_t2) {
    try {
      return !!_t2();
    } catch (t) {
      return !0;
    }
  },
      e = !t(function () {
    return 7 != Object.defineProperty({}, 1, {
      get: function get() {
        return 7;
      }
    })[1];
  }),
      r = "undefined" != typeof globalThis ? globalThis : "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof self ? self : {};

  function n(t, e) {
    return t(e = {
      exports: {}
    }, e.exports), e.exports;
  }

  var i = function i(t) {
    return t && t.Math == Math && t;
  },
      o = i("object" == (typeof globalThis === "undefined" ? "undefined" : _typeof(globalThis)) && globalThis) || i("object" == (typeof window === "undefined" ? "undefined" : _typeof(window)) && window) || i("object" == (typeof self === "undefined" ? "undefined" : _typeof(self)) && self) || i("object" == _typeof(r) && r) || function () {
    return this;
  }() || Function("return this")(),
      s = /#|\.prototype\./,
      a = function a(e, r) {
    var n = l[u(e)];
    return n == h || n != c && ("function" == typeof r ? t(r) : !!r);
  },
      u = a.normalize = function (t) {
    return String(t).replace(s, ".").toLowerCase();
  },
      l = a.data = {},
      c = a.NATIVE = "N",
      h = a.POLYFILL = "P",
      p = a,
      f = function f(t) {
    return "object" == _typeof(t) ? null !== t : "function" == typeof t;
  },
      g = o.document,
      d = f(g) && f(g.createElement),
      _ = function _(t) {
    return d ? g.createElement(t) : {};
  },
      m = !e && !t(function () {
    return 7 != Object.defineProperty(_("div"), "a", {
      get: function get() {
        return 7;
      }
    }).a;
  }),
      v = function v(t) {
    if (!f(t)) throw TypeError(String(t) + " is not an object");
    return t;
  },
      y = function y(t, e) {
    if (!f(t)) return t;
    var r, n;
    if (e && "function" == typeof (r = t.toString) && !f(n = r.call(t))) return n;
    if ("function" == typeof (r = t.valueOf) && !f(n = r.call(t))) return n;
    if (!e && "function" == typeof (r = t.toString) && !f(n = r.call(t))) return n;
    throw TypeError("Can't convert object to primitive value");
  },
      x = Object.defineProperty,
      S = {
    f: e ? x : function (t, e, r) {
      if (v(t), e = y(e, !0), v(r), m) try {
        return x(t, e, r);
      } catch (t) {}
      if ("get" in r || "set" in r) throw TypeError("Accessors not supported");
      return "value" in r && (t[e] = r.value), t;
    }
  },
      b = function b(t, e) {
    return {
      enumerable: !(1 & t),
      configurable: !(2 & t),
      writable: !(4 & t),
      value: e
    };
  },
      M = e ? function (t, e, r) {
    return S.f(t, e, b(1, r));
  } : function (t, e, r) {
    return t[e] = r, t;
  },
      E = function E(t) {
    if (null == t) throw TypeError("Can't call method on " + t);
    return t;
  },
      I = function I(t) {
    return Object(E(t));
  },
      C = {}.hasOwnProperty,
      k = function k(t, e) {
    return C.call(I(t), e);
  },
      w = function w(t, e) {
    try {
      M(o, t, e);
    } catch (r) {
      o[t] = e;
    }

    return e;
  },
      O = "__core-js_shared__",
      A = o[O] || w(O, {}),
      T = Function.toString;

  "function" != typeof A.inspectSource && (A.inspectSource = function (t) {
    return T.call(t);
  });

  var P,
      L,
      z,
      j = A.inspectSource,
      R = o.WeakMap,
      N = "function" == typeof R && /native code/.test(j(R)),
      B = n(function (t) {
    (t.exports = function (t, e) {
      return A[t] || (A[t] = void 0 !== e ? e : {});
    })("versions", []).push({
      version: "3.12.1",
      mode: "global",
      copyright: "© 2021 Denis Pushkarev (zloirock.ru)"
    });
  }),
      Z = 0,
      D = Math.random(),
      F = function F(t) {
    return "Symbol(" + String(void 0 === t ? "" : t) + ")_" + (++Z + D).toString(36);
  },
      H = B("keys"),
      U = function U(t) {
    return H[t] || (H[t] = F(t));
  },
      $ = {},
      G = "Object already initialized",
      V = o.WeakMap;

  if (N || A.state) {
    var W = A.state || (A.state = new V()),
        X = W.get,
        Y = W.has,
        K = W.set;
    P = function P(t, e) {
      if (Y.call(W, t)) throw new TypeError(G);
      return e.facade = t, K.call(W, t, e), e;
    }, L = function L(t) {
      return X.call(W, t) || {};
    }, z = function z(t) {
      return Y.call(W, t);
    };
  } else {
    var q = U("state");
    $[q] = !0, P = function P(t, e) {
      if (k(t, q)) throw new TypeError(G);
      return e.facade = t, M(t, q, e), e;
    }, L = function L(t) {
      return k(t, q) ? t[q] : {};
    }, z = function z(t) {
      return k(t, q);
    };
  }

  var J,
      Q = {
    set: P,
    get: L,
    has: z,
    enforce: function enforce(t) {
      return z(t) ? L(t) : P(t, {});
    },
    getterFor: function getterFor(t) {
      return function (e) {
        var r;
        if (!f(e) || (r = L(e)).type !== t) throw TypeError("Incompatible receiver, " + t + " required");
        return r;
      };
    }
  },
      tt = n(function (t) {
    var e = Q.get,
        r = Q.enforce,
        n = String(String).split("String");
    (t.exports = function (t, e, i, s) {
      var a,
          u = !!s && !!s.unsafe,
          l = !!s && !!s.enumerable,
          c = !!s && !!s.noTargetGet;
      "function" == typeof i && ("string" != typeof e || k(i, "name") || M(i, "name", e), (a = r(i)).source || (a.source = n.join("string" == typeof e ? e : ""))), t !== o ? (u ? !c && t[e] && (l = !0) : delete t[e], l ? t[e] = i : M(t, e, i)) : l ? t[e] = i : w(e, i);
    })(Function.prototype, "toString", function () {
      return "function" == typeof this && e(this).source || j(this);
    });
  }),
      et = {}.toString,
      rt = function rt(t) {
    return et.call(t).slice(8, -1);
  },
      nt = Object.setPrototypeOf || ("__proto__" in {} ? function () {
    var t,
        e = !1,
        r = {};

    try {
      (t = Object.getOwnPropertyDescriptor(Object.prototype, "__proto__").set).call(r, []), e = r instanceof Array;
    } catch (t) {}

    return function (r, n) {
      return v(r), function (t) {
        if (!f(t) && null !== t) throw TypeError("Can't set " + String(t) + " as a prototype");
      }(n), e ? t.call(r, n) : r.__proto__ = n, r;
    };
  }() : void 0),
      it = function it(t, e, r) {
    var n, i;
    return nt && "function" == typeof (n = e.constructor) && n !== r && f(i = n.prototype) && i !== r.prototype && nt(t, i), t;
  },
      ot = "".split,
      st = t(function () {
    return !Object("z").propertyIsEnumerable(0);
  }) ? function (t) {
    return "String" == rt(t) ? ot.call(t, "") : Object(t);
  } : Object,
      at = function at(t) {
    return st(E(t));
  },
      ut = Math.ceil,
      lt = Math.floor,
      ct = function ct(t) {
    return isNaN(t = +t) ? 0 : (t > 0 ? lt : ut)(t);
  },
      ht = Math.min,
      pt = function pt(t) {
    return t > 0 ? ht(ct(t), 9007199254740991) : 0;
  },
      ft = Math.max,
      gt = Math.min,
      dt = function dt(t, e) {
    var r = ct(t);
    return r < 0 ? ft(r + e, 0) : gt(r, e);
  },
      _t = function _t(t) {
    return function (e, r, n) {
      var i,
          o = at(e),
          s = pt(o.length),
          a = dt(n, s);

      if (t && r != r) {
        for (; s > a;) {
          if ((i = o[a++]) != i) return !0;
        }
      } else for (; s > a; a++) {
        if ((t || a in o) && o[a] === r) return t || a || 0;
      }

      return !t && -1;
    };
  },
      mt = {
    includes: _t(!0),
    indexOf: _t(!1)
  }.indexOf,
      vt = function vt(t, e) {
    var r,
        n = at(t),
        i = 0,
        o = [];

    for (r in n) {
      !k($, r) && k(n, r) && o.push(r);
    }

    for (; e.length > i;) {
      k(n, r = e[i++]) && (~mt(o, r) || o.push(r));
    }

    return o;
  },
      yt = ["constructor", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString", "toString", "valueOf"],
      xt = Object.keys || function (t) {
    return vt(t, yt);
  },
      St = e ? Object.defineProperties : function (t, e) {
    v(t);

    for (var r, n = xt(e), i = n.length, o = 0; i > o;) {
      S.f(t, r = n[o++], e[r]);
    }

    return t;
  },
      bt = o,
      Mt = function Mt(t) {
    return "function" == typeof t ? t : void 0;
  },
      Et = function Et(t, e) {
    return arguments.length < 2 ? Mt(bt[t]) || Mt(o[t]) : bt[t] && bt[t][e] || o[t] && o[t][e];
  },
      It = Et("document", "documentElement"),
      Ct = U("IE_PROTO"),
      kt = function kt() {},
      wt = function wt(t) {
    return "<script>" + t + "</" + "script>";
  },
      _Ot = function Ot() {
    try {
      J = document.domain && new ActiveXObject("htmlfile");
    } catch (t) {}

    var t, e;
    _Ot = J ? function (t) {
      t.write(wt("")), t.close();
      var e = t.parentWindow.Object;
      return t = null, e;
    }(J) : ((e = _("iframe")).style.display = "none", It.appendChild(e), e.src = String("javascript:"), (t = e.contentWindow.document).open(), t.write(wt("document.F=Object")), t.close(), t.F);

    for (var r = yt.length; r--;) {
      delete _Ot.prototype[yt[r]];
    }

    return _Ot();
  };

  $[Ct] = !0;

  var At = Object.create || function (t, e) {
    var r;
    return null !== t ? (kt.prototype = v(t), r = new kt(), kt.prototype = null, r[Ct] = t) : r = _Ot(), void 0 === e ? r : St(r, e);
  },
      Tt = yt.concat("length", "prototype"),
      Pt = {
    f: Object.getOwnPropertyNames || function (t) {
      return vt(t, Tt);
    }
  },
      Lt = {}.propertyIsEnumerable,
      zt = Object.getOwnPropertyDescriptor,
      jt = {
    f: zt && !Lt.call({
      1: 2
    }, 1) ? function (t) {
      var e = zt(this, t);
      return !!e && e.enumerable;
    } : Lt
  },
      Rt = Object.getOwnPropertyDescriptor,
      Nt = {
    f: e ? Rt : function (t, e) {
      if (t = at(t), e = y(e, !0), m) try {
        return Rt(t, e);
      } catch (t) {}
      if (k(t, e)) return b(!jt.f.call(t, e), t[e]);
    }
  },
      Bt = "[\t\n\x0B\f\r \xA0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000\u2028\u2029\uFEFF]",
      Zt = RegExp("^" + Bt + Bt + "*"),
      Dt = RegExp(Bt + Bt + "*$"),
      Ft = function Ft(t) {
    return function (e) {
      var r = String(E(e));
      return 1 & t && (r = r.replace(Zt, "")), 2 & t && (r = r.replace(Dt, "")), r;
    };
  },
      Ht = {
    start: Ft(1),
    end: Ft(2),
    trim: Ft(3)
  },
      Ut = Pt.f,
      $t = Nt.f,
      Gt = S.f,
      Vt = Ht.trim,
      Wt = "Number",
      Xt = o.Number,
      Yt = Xt.prototype,
      Kt = rt(At(Yt)) == Wt,
      qt = function qt(t) {
    var e,
        r,
        n,
        i,
        o,
        s,
        a,
        u,
        l = y(t, !1);
    if ("string" == typeof l && l.length > 2) if (43 === (e = (l = Vt(l)).charCodeAt(0)) || 45 === e) {
      if (88 === (r = l.charCodeAt(2)) || 120 === r) return NaN;
    } else if (48 === e) {
      switch (l.charCodeAt(1)) {
        case 66:
        case 98:
          n = 2, i = 49;
          break;

        case 79:
        case 111:
          n = 8, i = 55;
          break;

        default:
          return +l;
      }

      for (s = (o = l.slice(2)).length, a = 0; a < s; a++) {
        if ((u = o.charCodeAt(a)) < 48 || u > i) return NaN;
      }

      return parseInt(o, n);
    }
    return +l;
  };

  if (p(Wt, !Xt(" 0o1") || !Xt("0b1") || Xt("+0x1"))) {
    for (var Jt, Qt = function Qt(e) {
      var r = arguments.length < 1 ? 0 : e,
          n = this;
      return n instanceof Qt && (Kt ? t(function () {
        Yt.valueOf.call(n);
      }) : rt(n) != Wt) ? it(new Xt(qt(r)), n, Qt) : qt(r);
    }, te = e ? Ut(Xt) : "MAX_VALUE,MIN_VALUE,NaN,NEGATIVE_INFINITY,POSITIVE_INFINITY,EPSILON,isFinite,isInteger,isNaN,isSafeInteger,MAX_SAFE_INTEGER,MIN_SAFE_INTEGER,parseFloat,parseInt,isInteger,fromString,range".split(","), ee = 0; te.length > ee; ee++) {
      k(Xt, Jt = te[ee]) && !k(Qt, Jt) && Gt(Qt, Jt, $t(Xt, Jt));
    }

    Qt.prototype = Yt, Yt.constructor = Qt, tt(o, Wt, Qt);
  }

  var re,
      ne,
      ie = {
    f: Object.getOwnPropertySymbols
  },
      oe = Et("Reflect", "ownKeys") || function (t) {
    var e = Pt.f(v(t)),
        r = ie.f;
    return r ? e.concat(r(t)) : e;
  },
      se = function se(t, e) {
    for (var r = oe(e), n = S.f, i = Nt.f, o = 0; o < r.length; o++) {
      var s = r[o];
      k(t, s) || n(t, s, i(e, s));
    }
  },
      ae = Nt.f,
      ue = function ue(t, e) {
    var r,
        n,
        i,
        s,
        a,
        u = t.target,
        l = t.global,
        c = t.stat;
    if (r = l ? o : c ? o[u] || w(u, {}) : (o[u] || {}).prototype) for (n in e) {
      if (s = e[n], i = t.noTargetGet ? (a = ae(r, n)) && a.value : r[n], !p(l ? n : u + (c ? "." : "#") + n, t.forced) && void 0 !== i) {
        if (_typeof(s) == _typeof(i)) continue;
        se(s, i);
      }

      (t.sham || i && i.sham) && M(s, "sham", !0), tt(r, n, s, t);
    }
  },
      le = Array.isArray || function (t) {
    return "Array" == rt(t);
  },
      ce = Et("navigator", "userAgent") || "",
      he = o.process,
      pe = he && he.versions,
      fe = pe && pe.v8;

  fe ? ne = (re = fe.split("."))[0] < 4 ? 1 : re[0] + re[1] : ce && (!(re = ce.match(/Edge\/(\d+)/)) || re[1] >= 74) && (re = ce.match(/Chrome\/(\d+)/)) && (ne = re[1]);

  var ge = ne && +ne,
      de = !!Object.getOwnPropertySymbols && !t(function () {
    return !String(Symbol()) || !Symbol.sham && ge && ge < 41;
  }),
      _e = de && !Symbol.sham && "symbol" == _typeof(Symbol.iterator),
      me = B("wks"),
      ve = o.Symbol,
      ye = _e ? ve : ve && ve.withoutSetter || F,
      xe = function xe(t) {
    return k(me, t) && (de || "string" == typeof me[t]) || (de && k(ve, t) ? me[t] = ve[t] : me[t] = ye("Symbol." + t)), me[t];
  },
      Se = xe("species"),
      be = function be(t, e) {
    var r;
    return le(t) && ("function" != typeof (r = t.constructor) || r !== Array && !le(r.prototype) ? f(r) && null === (r = r[Se]) && (r = void 0) : r = void 0), new (void 0 === r ? Array : r)(0 === e ? 0 : e);
  },
      Me = function Me(t, e, r) {
    var n = y(e);
    n in t ? S.f(t, n, b(0, r)) : t[n] = r;
  },
      Ee = xe("species"),
      Ie = function Ie(e) {
    return ge >= 51 || !t(function () {
      var t = [];
      return (t.constructor = {})[Ee] = function () {
        return {
          foo: 1
        };
      }, 1 !== t[e](Boolean).foo;
    });
  },
      Ce = Ie("splice"),
      ke = Math.max,
      we = Math.min,
      Oe = 9007199254740991,
      Ae = "Maximum allowed length exceeded";

  ue({
    target: "Array",
    proto: !0,
    forced: !Ce
  }, {
    splice: function splice(t, e) {
      var r,
          n,
          i,
          o,
          s,
          a,
          u = I(this),
          l = pt(u.length),
          c = dt(t, l),
          h = arguments.length;
      if (0 === h ? r = n = 0 : 1 === h ? (r = 0, n = l - c) : (r = h - 2, n = we(ke(ct(e), 0), l - c)), l + r - n > Oe) throw TypeError(Ae);

      for (i = be(u, n), o = 0; o < n; o++) {
        (s = c + o) in u && Me(i, o, u[s]);
      }

      if (i.length = n, r < n) {
        for (o = c; o < l - n; o++) {
          a = o + r, (s = o + n) in u ? u[a] = u[s] : delete u[a];
        }

        for (o = l; o > l - n + r; o--) {
          delete u[o - 1];
        }
      } else if (r > n) for (o = l - n; o > c; o--) {
        a = o + r - 1, (s = o + n - 1) in u ? u[a] = u[s] : delete u[a];
      }

      for (o = 0; o < r; o++) {
        u[o + c] = arguments[o + 2];
      }

      return u.length = l - n + r, i;
    }
  });
  var Te = Ie("slice"),
      Pe = xe("species"),
      Le = [].slice,
      ze = Math.max;
  ue({
    target: "Array",
    proto: !0,
    forced: !Te
  }, {
    slice: function slice(t, e) {
      var r,
          n,
          i,
          o = at(this),
          s = pt(o.length),
          a = dt(t, s),
          u = dt(void 0 === e ? s : e, s);
      if (le(o) && ("function" != typeof (r = o.constructor) || r !== Array && !le(r.prototype) ? f(r) && null === (r = r[Pe]) && (r = void 0) : r = void 0, r === Array || void 0 === r)) return Le.call(o, a, u);

      for (n = new (void 0 === r ? Array : r)(ze(u - a, 0)), i = 0; a < u; a++, i++) {
        a in o && Me(n, i, o[a]);
      }

      return n.length = i, n;
    }
  });
  var je = {};
  je[xe("toStringTag")] = "z";
  var Re = "[object z]" === String(je),
      Ne = xe("toStringTag"),
      Be = "Arguments" == rt(function () {
    return arguments;
  }()),
      Ze = Re ? rt : function (t) {
    var e, r, n;
    return void 0 === t ? "Undefined" : null === t ? "Null" : "string" == typeof (r = function (t, e) {
      try {
        return t[e];
      } catch (t) {}
    }(e = Object(t), Ne)) ? r : Be ? rt(e) : "Object" == (n = rt(e)) && "function" == typeof e.callee ? "Arguments" : n;
  },
      De = Re ? {}.toString : function () {
    return "[object " + Ze(this) + "]";
  };
  Re || tt(Object.prototype, "toString", De, {
    unsafe: !0
  });

  var Fe = function Fe() {
    var t = v(this),
        e = "";
    return t.global && (e += "g"), t.ignoreCase && (e += "i"), t.multiline && (e += "m"), t.dotAll && (e += "s"), t.unicode && (e += "u"), t.sticky && (e += "y"), e;
  },
      He = "toString",
      Ue = RegExp.prototype,
      $e = Ue.toString,
      Ge = t(function () {
    return "/a/b" != $e.call({
      source: "a",
      flags: "b"
    });
  }),
      Ve = $e.name != He;

  (Ge || Ve) && tt(RegExp.prototype, He, function () {
    var t = v(this),
        e = String(t.source),
        r = t.flags;
    return "/" + e + "/" + String(void 0 === r && t instanceof RegExp && !("flags" in Ue) ? Fe.call(t) : r);
  }, {
    unsafe: !0
  });

  var _We = function We(t, e) {
    return (_We = Object.setPrototypeOf || {
      __proto__: []
    } instanceof Array && function (t, e) {
      t.__proto__ = e;
    } || function (t, e) {
      for (var r in e) {
        Object.prototype.hasOwnProperty.call(e, r) && (t[r] = e[r]);
      }
    })(t, e);
  };

  function Xe(t, e) {
    if ("function" != typeof e && null !== e) throw new TypeError("Class extends value " + String(e) + " is not a constructor or null");

    function r() {
      this.constructor = t;
    }

    _We(t, e), t.prototype = null === e ? Object.create(e) : (r.prototype = e.prototype, new r());
  }

  var Ye,
      Ke,
      _qe = function qe() {
    return (_qe = Object.assign || function (t) {
      for (var e, r = 1, n = arguments.length; r < n; r++) {
        for (var i in e = arguments[r]) {
          Object.prototype.hasOwnProperty.call(e, i) && (t[i] = e[i]);
        }
      }

      return t;
    }).apply(this, arguments);
  },
      Je = [].join,
      Qe = st != Object,
      tr = (Ye = ",", !!(Ke = []["join"]) && t(function () {
    Ke.call(null, Ye || function () {
      throw 1;
    }, 1);
  }));

  function er(t, e) {
    return RegExp(t, e);
  }

  ue({
    target: "Array",
    proto: !0,
    forced: Qe || !tr
  }, {
    join: function join(t) {
      return Je.call(at(this), void 0 === t ? "," : t);
    }
  }), ue({
    target: "Object",
    stat: !0,
    forced: t(function () {
      xt(1);
    })
  }, {
    keys: function keys(t) {
      return xt(I(t));
    }
  });
  var rr,
      nr,
      ir = {
    UNSUPPORTED_Y: t(function () {
      var t = er("a", "y");
      return t.lastIndex = 2, null != t.exec("abcd");
    }),
    BROKEN_CARET: t(function () {
      var t = er("^r", "gy");
      return t.lastIndex = 2, null != t.exec("str");
    })
  },
      or = RegExp.prototype.exec,
      sr = B("native-string-replace", String.prototype.replace),
      ar = or,
      ur = (rr = /a/, nr = /b*/g, or.call(rr, "a"), or.call(nr, "a"), 0 !== rr.lastIndex || 0 !== nr.lastIndex),
      lr = ir.UNSUPPORTED_Y || ir.BROKEN_CARET,
      cr = void 0 !== /()??/.exec("")[1];
  (ur || cr || lr) && (ar = function ar(t) {
    var e,
        r,
        n,
        i,
        o = this,
        s = lr && o.sticky,
        a = Fe.call(o),
        u = o.source,
        l = 0,
        c = t;
    return s && (-1 === (a = a.replace("y", "")).indexOf("g") && (a += "g"), c = String(t).slice(o.lastIndex), o.lastIndex > 0 && (!o.multiline || o.multiline && "\n" !== t[o.lastIndex - 1]) && (u = "(?: " + u + ")", c = " " + c, l++), r = new RegExp("^(?:" + u + ")", a)), cr && (r = new RegExp("^" + u + "$(?!\\s)", a)), ur && (e = o.lastIndex), n = or.call(s ? r : o, c), s ? n ? (n.input = n.input.slice(l), n[0] = n[0].slice(l), n.index = o.lastIndex, o.lastIndex += n[0].length) : o.lastIndex = 0 : ur && n && (o.lastIndex = o.global ? n.index + n[0].length : e), cr && n && n.length > 1 && sr.call(n[0], r, function () {
      for (i = 1; i < arguments.length - 2; i++) {
        void 0 === arguments[i] && (n[i] = void 0);
      }
    }), n;
  });
  var hr = ar;
  ue({
    target: "RegExp",
    proto: !0,
    forced: /./.exec !== hr
  }, {
    exec: hr
  });

  var pr = xe("species"),
      fr = RegExp.prototype,
      gr = !t(function () {
    var t = /./;
    return t.exec = function () {
      var t = [];
      return t.groups = {
        a: "7"
      }, t;
    }, "7" !== "".replace(t, "$<a>");
  }),
      dr = "$0" === "a".replace(/./, "$0"),
      _r = xe("replace"),
      mr = !!/./[_r] && "" === /./[_r]("a", "$0"),
      vr = !t(function () {
    var t = /(?:)/,
        e = t.exec;

    t.exec = function () {
      return e.apply(this, arguments);
    };

    var r = "ab".split(t);
    return 2 !== r.length || "a" !== r[0] || "b" !== r[1];
  }),
      yr = function yr(e, r, n, i) {
    var o = xe(e),
        s = !t(function () {
      var t = {};
      return t[o] = function () {
        return 7;
      }, 7 != ""[e](t);
    }),
        a = s && !t(function () {
      var t = !1,
          r = /a/;
      return "split" === e && ((r = {}).constructor = {}, r.constructor[pr] = function () {
        return r;
      }, r.flags = "", r[o] = /./[o]), r.exec = function () {
        return t = !0, null;
      }, r[o](""), !t;
    });

    if (!s || !a || "replace" === e && (!gr || !dr || mr) || "split" === e && !vr) {
      var u = /./[o],
          l = n(o, ""[e], function (t, e, r, n, i) {
        var o = e.exec;
        return o === hr || o === fr.exec ? s && !i ? {
          done: !0,
          value: u.call(e, r, n)
        } : {
          done: !0,
          value: t.call(r, e, n)
        } : {
          done: !1
        };
      }, {
        REPLACE_KEEPS_$0: dr,
        REGEXP_REPLACE_SUBSTITUTES_UNDEFINED_CAPTURE: mr
      }),
          c = l[0],
          h = l[1];
      tt(String.prototype, e, c), tt(fr, o, 2 == r ? function (t, e) {
        return h.call(t, this, e);
      } : function (t) {
        return h.call(t, this);
      });
    }

    i && M(fr[o], "sham", !0);
  },
      xr = xe("match"),
      Sr = xe("species"),
      br = function br(t, e) {
    var r,
        n = v(t).constructor;
    return void 0 === n || null == (r = v(n)[Sr]) ? e : function (t) {
      if ("function" != typeof t) throw TypeError(String(t) + " is not a function");
      return t;
    }(r);
  },
      Mr = function Mr(t) {
    return function (e, r) {
      var n,
          i,
          o = String(E(e)),
          s = ct(r),
          a = o.length;
      return s < 0 || s >= a ? t ? "" : void 0 : (n = o.charCodeAt(s)) < 55296 || n > 56319 || s + 1 === a || (i = o.charCodeAt(s + 1)) < 56320 || i > 57343 ? t ? o.charAt(s) : n : t ? o.slice(s, s + 2) : i - 56320 + (n - 55296 << 10) + 65536;
    };
  },
      Er = {
    codeAt: Mr(!1),
    charAt: Mr(!0)
  }.charAt,
      Ir = function Ir(t, e, r) {
    return e + (r ? Er(t, e).length : 1);
  },
      Cr = function Cr(t, e) {
    var r = t.exec;

    if ("function" == typeof r) {
      var n = r.call(t, e);
      if ("object" != _typeof(n)) throw TypeError("RegExp exec method returned something other than an Object or null");
      return n;
    }

    if ("RegExp" !== rt(t)) throw TypeError("RegExp#exec called on incompatible receiver");
    return hr.call(t, e);
  },
      kr = ir.UNSUPPORTED_Y,
      wr = [].push,
      Or = Math.min,
      Ar = 4294967295;

  yr("split", 2, function (t, e, r) {
    var n;
    return n = "c" == "abbc".split(/(b)*/)[1] || 4 != "test".split(/(?:)/, -1).length || 2 != "ab".split(/(?:ab)*/).length || 4 != ".".split(/(.?)(.?)/).length || ".".split(/()()/).length > 1 || "".split(/.?/).length ? function (t, r) {
      var n,
          i,
          o = String(E(this)),
          s = void 0 === r ? Ar : r >>> 0;
      if (0 === s) return [];
      if (void 0 === t) return [o];
      if (!f(n = t) || !(void 0 !== (i = n[xr]) ? i : "RegExp" == rt(n))) return e.call(o, t, s);

      for (var a, u, l, c = [], h = (t.ignoreCase ? "i" : "") + (t.multiline ? "m" : "") + (t.unicode ? "u" : "") + (t.sticky ? "y" : ""), p = 0, g = new RegExp(t.source, h + "g"); (a = hr.call(g, o)) && !((u = g.lastIndex) > p && (c.push(o.slice(p, a.index)), a.length > 1 && a.index < o.length && wr.apply(c, a.slice(1)), l = a[0].length, p = u, c.length >= s));) {
        g.lastIndex === a.index && g.lastIndex++;
      }

      return p === o.length ? !l && g.test("") || c.push("") : c.push(o.slice(p)), c.length > s ? c.slice(0, s) : c;
    } : "0".split(void 0, 0).length ? function (t, r) {
      return void 0 === t && 0 === r ? [] : e.call(this, t, r);
    } : e, [function (e, r) {
      var i = E(this),
          o = null == e ? void 0 : e[t];
      return void 0 !== o ? o.call(e, i, r) : n.call(String(i), e, r);
    }, function (t, i) {
      var o = r(n, t, this, i, n !== e);
      if (o.done) return o.value;
      var s = v(t),
          a = String(this),
          u = br(s, RegExp),
          l = s.unicode,
          c = (s.ignoreCase ? "i" : "") + (s.multiline ? "m" : "") + (s.unicode ? "u" : "") + (kr ? "g" : "y"),
          h = new u(kr ? "^(?:" + s.source + ")" : s, c),
          p = void 0 === i ? Ar : i >>> 0;
      if (0 === p) return [];
      if (0 === a.length) return null === Cr(h, a) ? [a] : [];

      for (var f = 0, g = 0, d = []; g < a.length;) {
        h.lastIndex = kr ? 0 : g;

        var _,
            m = Cr(h, kr ? a.slice(g) : a);

        if (null === m || (_ = Or(pt(h.lastIndex + (kr ? g : 0)), a.length)) === f) g = Ir(a, g, l);else {
          if (d.push(a.slice(f, g)), d.length === p) return d;

          for (var y = 1; y <= m.length - 1; y++) {
            if (d.push(m[y]), d.length === p) return d;
          }

          g = f = _;
        }
      }

      return d.push(a.slice(f)), d;
    }];
  }, kr);

  var Tr = Math.floor,
      Pr = "".replace,
      Lr = /\$([$&'`]|\d{1,2}|<[^>]*>)/g,
      zr = /\$([$&'`]|\d{1,2})/g,
      jr = function jr(t, e, r, n, i, o) {
    var s = r + t.length,
        a = n.length,
        u = zr;
    return void 0 !== i && (i = I(i), u = Lr), Pr.call(o, u, function (o, u) {
      var l;

      switch (u.charAt(0)) {
        case "$":
          return "$";

        case "&":
          return t;

        case "`":
          return e.slice(0, r);

        case "'":
          return e.slice(s);

        case "<":
          l = i[u.slice(1, -1)];
          break;

        default:
          var c = +u;
          if (0 === c) return o;

          if (c > a) {
            var h = Tr(c / 10);
            return 0 === h ? o : h <= a ? void 0 === n[h - 1] ? u.charAt(1) : n[h - 1] + u.charAt(1) : o;
          }

          l = n[c - 1];
      }

      return void 0 === l ? "" : l;
    });
  },
      Rr = Math.max,
      Nr = Math.min;

  yr("replace", 2, function (t, e, r, n) {
    var i = n.REGEXP_REPLACE_SUBSTITUTES_UNDEFINED_CAPTURE,
        o = n.REPLACE_KEEPS_$0,
        s = i ? "$" : "$0";
    return [function (r, n) {
      var i = E(this),
          o = null == r ? void 0 : r[t];
      return void 0 !== o ? o.call(r, i, n) : e.call(String(i), r, n);
    }, function (t, n) {
      if (!i && o || "string" == typeof n && -1 === n.indexOf(s)) {
        var a = r(e, t, this, n);
        if (a.done) return a.value;
      }

      var u = v(t),
          l = String(this),
          c = "function" == typeof n;
      c || (n = String(n));
      var h = u.global;

      if (h) {
        var p = u.unicode;
        u.lastIndex = 0;
      }

      for (var f = [];;) {
        var g = Cr(u, l);
        if (null === g) break;
        if (f.push(g), !h) break;
        "" === String(g[0]) && (u.lastIndex = Ir(l, pt(u.lastIndex), p));
      }

      for (var d, _ = "", m = 0, y = 0; y < f.length; y++) {
        g = f[y];

        for (var x = String(g[0]), S = Rr(Nr(ct(g.index), l.length), 0), b = [], M = 1; M < g.length; M++) {
          b.push(void 0 === (d = g[M]) ? d : String(d));
        }

        var E = g.groups;

        if (c) {
          var I = [x].concat(b, S, l);
          void 0 !== E && I.push(E);
          var C = String(n.apply(void 0, I));
        } else C = jr(x, l, S, b, E, n);

        S >= m && (_ += l.slice(m, S) + C, m = S + x.length);
      }

      return _ + l.slice(m);
    }];
  });

  var Br = function t() {
    !function (t, e) {
      for (var r in e.prototype) {
        t.prototype[r] = e.prototype[r];
      }
    }(t, google.maps.OverlayView);
  };

  function Zr(t) {
    return Object.keys(t).reduce(function (e, r) {
      return t[r] && e.push(r + ":" + t[r]), e;
    }, []).join(";");
  }

  function Dr(t) {
    return t ? t + "px" : void 0;
  }

  var Fr = function (t) {
    function e(e, r) {
      var n = t.call(this) || this;
      return n.cluster_ = e, n.styles_ = r, n.center_ = null, n.div_ = null, n.sums_ = null, n.visible_ = !1, n.style = null, n.setMap(e.getMap()), n;
    }

    return Xe(e, t), e.prototype.onAdd = function () {
      var t,
          e,
          r = this,
          n = this.cluster_.getMarkerClusterer(),
          i = google.maps.version.split("."),
          o = i[0],
          s = i[1],
          a = 100 * parseInt(o, 10) + parseInt(s, 10);
      this.div_ = document.createElement("div"), this.visible_ && this.show(), this.getPanes().overlayMouseTarget.appendChild(this.div_), this.boundsChangedListener_ = google.maps.event.addListener(this.getMap(), "bounds_changed", function () {
        e = t;
      }), google.maps.event.addDomListener(this.div_, "mousedown", function () {
        t = !0, e = !1;
      }), google.maps.event.addDomListener(this.div_, "contextmenu", function () {
        google.maps.event.trigger(n, "contextmenu", r.cluster_);
      }), a >= 332 && google.maps.event.addDomListener(this.div_, "touchstart", function (t) {
        t.stopPropagation();
      }), google.maps.event.addDomListener(this.div_, "click", function (i) {
        if (t = !1, !e) {
          if (google.maps.event.trigger(n, "click", r.cluster_), google.maps.event.trigger(n, "clusterclick", r.cluster_), n.getZoomOnClick()) {
            var o = n.getMaxZoom(),
                s = r.cluster_.getBounds();
            n.getMap().fitBounds(s), setTimeout(function () {
              n.getMap().fitBounds(s), null !== o && n.getMap().getZoom() > o && n.getMap().setZoom(o + 1);
            }, 100);
          }

          i.cancelBubble = !0, i.stopPropagation && i.stopPropagation();
        }
      }), google.maps.event.addDomListener(this.div_, "mouseover", function () {
        google.maps.event.trigger(n, "mouseover", r.cluster_);
      }), google.maps.event.addDomListener(this.div_, "mouseout", function () {
        google.maps.event.trigger(n, "mouseout", r.cluster_);
      });
    }, e.prototype.onRemove = function () {
      this.div_ && this.div_.parentNode && (this.hide(), google.maps.event.removeListener(this.boundsChangedListener_), google.maps.event.clearInstanceListeners(this.div_), this.div_.parentNode.removeChild(this.div_), this.div_ = null);
    }, e.prototype.draw = function () {
      if (this.visible_) {
        var t = this.getPosFromLatLng_(this.center_);
        this.div_.style.top = t.y + "px", this.div_.style.left = t.x + "px";
      }
    }, e.prototype.hide = function () {
      this.div_ && (this.div_.style.display = "none"), this.visible_ = !1;
    }, e.prototype.show = function () {
      this.div_ && (this.div_.className = this.className_, this.div_.style.cssText = this.createCss_(this.getPosFromLatLng_(this.center_)), this.div_.innerHTML = (this.style.url ? this.getImageElementHtml() : "") + this.getLabelDivHtml(), void 0 === this.sums_.title || "" === this.sums_.title ? this.div_.title = this.cluster_.getMarkerClusterer().getTitle() : this.div_.title = this.sums_.title, this.div_.style.display = ""), this.visible_ = !0;
    }, e.prototype.getLabelDivHtml = function () {
      return '\n<div aria-label="' + this.cluster_.getMarkerClusterer().ariaLabelFn(this.sums_.text) + '" style="' + Zr({
        position: "absolute",
        top: Dr(this.anchorText_[0]),
        left: Dr(this.anchorText_[1]),
        color: this.style.textColor,
        "font-size": Dr(this.style.textSize),
        "font-family": this.style.fontFamily,
        "font-weight": this.style.fontWeight,
        "font-style": this.style.fontStyle,
        "text-decoration": this.style.textDecoration,
        "text-align": "center",
        width: Dr(this.style.width),
        "line-height": Dr(this.style.textLineHeight)
      }) + '" tabindex="0">\n  <span aria-hidden="true">' + this.sums_.text + "</span>\n</div>\n";
    }, e.prototype.getImageElementHtml = function () {
      var t = (this.style.backgroundPosition || "0 0").split(" "),
          e = parseInt(t[0].replace(/^\s+|\s+$/g, ""), 10),
          r = parseInt(t[1].replace(/^\s+|\s+$/g, ""), 10),
          n = {};
      if (this.cluster_.getMarkerClusterer().getEnableRetinaIcons()) n = {
        width: Dr(this.style.width),
        height: Dr(this.style.height)
      };else {
        var i = [-1 * r, -1 * e + this.style.width, -1 * r + this.style.height, -1 * e];
        n = {
          clip: "rect(" + i[0] + "px, " + i[1] + "px, " + i[2] + "px, " + i[3] + "px)"
        };
      }
      var o = this.sums_.url ? {
        width: "100%",
        height: "100%"
      } : {},
          s = Zr(_qe(_qe({
        position: "absolute",
        top: Dr(r),
        left: Dr(e)
      }, n), o));
      return '<img alt="' + this.sums_.text + '" aria-hidden="true" src="' + this.style.url + '" style="' + s + '"/>';
    }, e.prototype.useStyle = function (t) {
      this.sums_ = t;
      var e = Math.max(0, t.index - 1);
      e = Math.min(this.styles_.length - 1, e), this.style = this.sums_.url ? _qe(_qe({}, this.styles_[e]), {
        url: this.sums_.url
      }) : this.styles_[e], this.anchorText_ = this.style.anchorText || [0, 0], this.anchorIcon_ = this.style.anchorIcon || [Math.floor(this.style.height / 2), Math.floor(this.style.width / 2)], this.className_ = this.cluster_.getMarkerClusterer().getClusterClass() + " " + (this.style.className || "cluster-" + e);
    }, e.prototype.setCenter = function (t) {
      this.center_ = t;
    }, e.prototype.createCss_ = function (t) {
      return Zr({
        "z-index": "" + this.cluster_.getMarkerClusterer().getZIndex(),
        top: Dr(t.y),
        left: Dr(t.x),
        width: Dr(this.style.width),
        height: Dr(this.style.height),
        cursor: "pointer",
        position: "absolute",
        "-webkit-user-select": "none",
        "-khtml-user-select": "none",
        "-moz-user-select": "none",
        "-o-user-select": "none",
        "user-select": "none"
      });
    }, e.prototype.getPosFromLatLng_ = function (t) {
      var e = this.getProjection().fromLatLngToDivPixel(t);
      return e.x = Math.floor(e.x - this.anchorIcon_[1]), e.y = Math.floor(e.y - this.anchorIcon_[0]), e;
    }, e;
  }(Br),
      Hr = function () {
    function t(t) {
      this.markerClusterer_ = t, this.map_ = this.markerClusterer_.getMap(), this.minClusterSize_ = this.markerClusterer_.getMinimumClusterSize(), this.averageCenter_ = this.markerClusterer_.getAverageCenter(), this.markers_ = [], this.center_ = null, this.bounds_ = null, this.clusterIcon_ = new Fr(this, this.markerClusterer_.getStyles());
    }

    return t.prototype.getSize = function () {
      return this.markers_.length;
    }, t.prototype.getMarkers = function () {
      return this.markers_;
    }, t.prototype.getCenter = function () {
      return this.center_;
    }, t.prototype.getMap = function () {
      return this.map_;
    }, t.prototype.getMarkerClusterer = function () {
      return this.markerClusterer_;
    }, t.prototype.getBounds = function () {
      for (var t = new google.maps.LatLngBounds(this.center_, this.center_), e = this.getMarkers(), r = 0; r < e.length; r++) {
        t.extend(e[r].getPosition());
      }

      return t;
    }, t.prototype.remove = function () {
      this.clusterIcon_.setMap(null), this.markers_ = [], delete this.markers_;
    }, t.prototype.addMarker = function (t) {
      if (this.isMarkerAlreadyAdded_(t)) return !1;

      if (this.center_) {
        if (this.averageCenter_) {
          var e = this.markers_.length + 1,
              r = (this.center_.lat() * (e - 1) + t.getPosition().lat()) / e,
              n = (this.center_.lng() * (e - 1) + t.getPosition().lng()) / e;
          this.center_ = new google.maps.LatLng(r, n), this.calculateBounds_();
        }
      } else this.center_ = t.getPosition(), this.calculateBounds_();

      t.isAdded = !0, this.markers_.push(t);
      var i = this.markers_.length,
          o = this.markerClusterer_.getMaxZoom();
      if (null !== o && this.map_.getZoom() > o) t.getMap() !== this.map_ && t.setMap(this.map_);else if (i < this.minClusterSize_) t.getMap() !== this.map_ && t.setMap(this.map_);else if (i === this.minClusterSize_) for (var s = 0; s < i; s++) {
        this.markers_[s].setMap(null);
      } else t.setMap(null);
      return !0;
    }, t.prototype.isMarkerInClusterBounds = function (t) {
      return this.bounds_.contains(t.getPosition());
    }, t.prototype.calculateBounds_ = function () {
      var t = new google.maps.LatLngBounds(this.center_, this.center_);
      this.bounds_ = this.markerClusterer_.getExtendedBounds(t);
    }, t.prototype.updateIcon = function () {
      var t = this.markers_.length,
          e = this.markerClusterer_.getMaxZoom();
      if (null !== e && this.map_.getZoom() > e) this.clusterIcon_.hide();else if (t < this.minClusterSize_) this.clusterIcon_.hide();else {
        var r = this.markerClusterer_.getStyles().length,
            n = this.markerClusterer_.getCalculator()(this.markers_, r);
        this.clusterIcon_.setCenter(this.center_), this.clusterIcon_.useStyle(n), this.clusterIcon_.show();
      }
    }, t.prototype.isMarkerAlreadyAdded_ = function (t) {
      if (this.markers_.indexOf) return -1 !== this.markers_.indexOf(t);

      for (var e = 0; e < this.markers_.length; e++) {
        if (t === this.markers_[e]) return !0;
      }

      return !1;
    }, t;
  }(),
      Ur = function Ur(t, e, r) {
    return void 0 !== t[e] ? t[e] : r;
  };

  return function (t) {
    function e(r, n, i) {
      void 0 === n && (n = []), void 0 === i && (i = {});
      var o = t.call(this) || this;
      return o.options = i, o.markers_ = [], o.clusters_ = [], o.listeners_ = [], o.activeMap_ = null, o.ready_ = !1, o.ariaLabelFn = o.options.ariaLabelFn || function () {
        return "";
      }, o.zIndex_ = o.options.zIndex || Number(google.maps.Marker.MAX_ZINDEX) + 1, o.gridSize_ = o.options.gridSize || 60, o.minClusterSize_ = o.options.minimumClusterSize || 2, o.maxZoom_ = o.options.maxZoom || null, o.styles_ = o.options.styles || [], o.title_ = o.options.title || "", o.zoomOnClick_ = Ur(o.options, "zoomOnClick", !0), o.averageCenter_ = Ur(o.options, "averageCenter", !1), o.ignoreHidden_ = Ur(o.options, "ignoreHidden", !1), o.enableRetinaIcons_ = Ur(o.options, "enableRetinaIcons", !1), o.imagePath_ = o.options.imagePath || e.IMAGE_PATH, o.imageExtension_ = o.options.imageExtension || e.IMAGE_EXTENSION, o.imageSizes_ = o.options.imageSizes || e.IMAGE_SIZES, o.calculator_ = o.options.calculator || e.CALCULATOR, o.batchSize_ = o.options.batchSize || e.BATCH_SIZE, o.batchSizeIE_ = o.options.batchSizeIE || e.BATCH_SIZE_IE, o.clusterClass_ = o.options.clusterClass || "cluster", -1 !== navigator.userAgent.toLowerCase().indexOf("msie") && (o.batchSize_ = o.batchSizeIE_), o.setupStyles_(), o.addMarkers(n, !0), o.setMap(r), o;
    }

    return Xe(e, t), e.prototype.onAdd = function () {
      var t = this;
      this.activeMap_ = this.getMap(), this.ready_ = !0, this.repaint(), this.prevZoom_ = this.getMap().getZoom(), this.listeners_ = [google.maps.event.addListener(this.getMap(), "zoom_changed", function () {
        var e = t.getMap(),
            r = e.minZoom || 0,
            n = Math.min(e.maxZoom || 100, e.mapTypes[e.getMapTypeId()].maxZoom),
            i = Math.min(Math.max(t.getMap().getZoom(), r), n);
        t.prevZoom_ != i && (t.prevZoom_ = i, t.resetViewport_(!1));
      }), google.maps.event.addListener(this.getMap(), "idle", function () {
        t.redraw_();
      })];
    }, e.prototype.onRemove = function () {
      for (var t = 0; t < this.markers_.length; t++) {
        this.markers_[t].getMap() !== this.activeMap_ && this.markers_[t].setMap(this.activeMap_);
      }

      for (t = 0; t < this.clusters_.length; t++) {
        this.clusters_[t].remove();
      }

      this.clusters_ = [];

      for (t = 0; t < this.listeners_.length; t++) {
        google.maps.event.removeListener(this.listeners_[t]);
      }

      this.listeners_ = [], this.activeMap_ = null, this.ready_ = !1;
    }, e.prototype.draw = function () {}, e.prototype.setupStyles_ = function () {
      if (!(this.styles_.length > 0)) for (var t = 0; t < this.imageSizes_.length; t++) {
        var r = this.imageSizes_[t];
        this.styles_.push(e.withDefaultStyle({
          url: this.imagePath_ + (t + 1) + "." + this.imageExtension_,
          height: r,
          width: r
        }));
      }
    }, e.prototype.fitMapToMarkers = function (t) {
      for (var e = this.getMarkers(), r = new google.maps.LatLngBounds(), n = 0; n < e.length; n++) {
        !e[n].getVisible() && this.getIgnoreHidden() || r.extend(e[n].getPosition());
      }

      this.getMap().fitBounds(r, t);
    }, e.prototype.getGridSize = function () {
      return this.gridSize_;
    }, e.prototype.setGridSize = function (t) {
      this.gridSize_ = t;
    }, e.prototype.getMinimumClusterSize = function () {
      return this.minClusterSize_;
    }, e.prototype.setMinimumClusterSize = function (t) {
      this.minClusterSize_ = t;
    }, e.prototype.getMaxZoom = function () {
      return this.maxZoom_;
    }, e.prototype.setMaxZoom = function (t) {
      this.maxZoom_ = t;
    }, e.prototype.getZIndex = function () {
      return this.zIndex_;
    }, e.prototype.setZIndex = function (t) {
      this.zIndex_ = t;
    }, e.prototype.getStyles = function () {
      return this.styles_;
    }, e.prototype.setStyles = function (t) {
      this.styles_ = t;
    }, e.prototype.getTitle = function () {
      return this.title_;
    }, e.prototype.setTitle = function (t) {
      this.title_ = t;
    }, e.prototype.getZoomOnClick = function () {
      return this.zoomOnClick_;
    }, e.prototype.setZoomOnClick = function (t) {
      this.zoomOnClick_ = t;
    }, e.prototype.getAverageCenter = function () {
      return this.averageCenter_;
    }, e.prototype.setAverageCenter = function (t) {
      this.averageCenter_ = t;
    }, e.prototype.getIgnoreHidden = function () {
      return this.ignoreHidden_;
    }, e.prototype.setIgnoreHidden = function (t) {
      this.ignoreHidden_ = t;
    }, e.prototype.getEnableRetinaIcons = function () {
      return this.enableRetinaIcons_;
    }, e.prototype.setEnableRetinaIcons = function (t) {
      this.enableRetinaIcons_ = t;
    }, e.prototype.getImageExtension = function () {
      return this.imageExtension_;
    }, e.prototype.setImageExtension = function (t) {
      this.imageExtension_ = t;
    }, e.prototype.getImagePath = function () {
      return this.imagePath_;
    }, e.prototype.setImagePath = function (t) {
      this.imagePath_ = t;
    }, e.prototype.getImageSizes = function () {
      return this.imageSizes_;
    }, e.prototype.setImageSizes = function (t) {
      this.imageSizes_ = t;
    }, e.prototype.getCalculator = function () {
      return this.calculator_;
    }, e.prototype.setCalculator = function (t) {
      this.calculator_ = t;
    }, e.prototype.getBatchSizeIE = function () {
      return this.batchSizeIE_;
    }, e.prototype.setBatchSizeIE = function (t) {
      this.batchSizeIE_ = t;
    }, e.prototype.getClusterClass = function () {
      return this.clusterClass_;
    }, e.prototype.setClusterClass = function (t) {
      this.clusterClass_ = t;
    }, e.prototype.getMarkers = function () {
      return this.markers_;
    }, e.prototype.getTotalMarkers = function () {
      return this.markers_.length;
    }, e.prototype.getClusters = function () {
      return this.clusters_;
    }, e.prototype.getTotalClusters = function () {
      return this.clusters_.length;
    }, e.prototype.addMarker = function (t, e) {
      this.pushMarkerTo_(t), e || this.redraw_();
    }, e.prototype.addMarkers = function (t, e) {
      for (var r in t) {
        Object.prototype.hasOwnProperty.call(t, r) && this.pushMarkerTo_(t[r]);
      }

      e || this.redraw_();
    }, e.prototype.pushMarkerTo_ = function (t) {
      var e = this;
      t.getDraggable() && google.maps.event.addListener(t, "dragend", function () {
        e.ready_ && (t.isAdded = !1, e.repaint());
      }), t.isAdded = !1, this.markers_.push(t);
    }, e.prototype.removeMarker = function (t, e) {
      var r = this.removeMarker_(t);
      return !e && r && this.repaint(), r;
    }, e.prototype.removeMarkers = function (t, e) {
      for (var r = !1, n = 0; n < t.length; n++) {
        var i = this.removeMarker_(t[n]);
        r = r || i;
      }

      return !e && r && this.repaint(), r;
    }, e.prototype.removeMarker_ = function (t) {
      var e = -1;
      if (this.markers_.indexOf) e = this.markers_.indexOf(t);else for (var r = 0; r < this.markers_.length; r++) {
        if (t === this.markers_[r]) {
          e = r;
          break;
        }
      }
      return -1 !== e && (t.setMap(null), this.markers_.splice(e, 1), !0);
    }, e.prototype.clearMarkers = function () {
      this.resetViewport_(!0), this.markers_ = [];
    }, e.prototype.repaint = function () {
      var t = this.clusters_.slice();
      this.clusters_ = [], this.resetViewport_(!1), this.redraw_(), setTimeout(function () {
        for (var e = 0; e < t.length; e++) {
          t[e].remove();
        }
      }, 0);
    }, e.prototype.getExtendedBounds = function (t) {
      var e = this.getProjection(),
          r = new google.maps.LatLng(t.getNorthEast().lat(), t.getNorthEast().lng()),
          n = new google.maps.LatLng(t.getSouthWest().lat(), t.getSouthWest().lng()),
          i = e.fromLatLngToDivPixel(r);
      i.x += this.gridSize_, i.y -= this.gridSize_;
      var o = e.fromLatLngToDivPixel(n);
      o.x -= this.gridSize_, o.y += this.gridSize_;
      var s = e.fromDivPixelToLatLng(i),
          a = e.fromDivPixelToLatLng(o);
      return t.extend(s), t.extend(a), t;
    }, e.prototype.redraw_ = function () {
      this.createClusters_(0);
    }, e.prototype.resetViewport_ = function (t) {
      for (var e = 0; e < this.clusters_.length; e++) {
        this.clusters_[e].remove();
      }

      this.clusters_ = [];

      for (e = 0; e < this.markers_.length; e++) {
        var r = this.markers_[e];
        r.isAdded = !1, t && r.setMap(null);
      }
    }, e.prototype.distanceBetweenPoints_ = function (t, e) {
      var r = (e.lat() - t.lat()) * Math.PI / 180,
          n = (e.lng() - t.lng()) * Math.PI / 180,
          i = Math.sin(r / 2) * Math.sin(r / 2) + Math.cos(t.lat() * Math.PI / 180) * Math.cos(e.lat() * Math.PI / 180) * Math.sin(n / 2) * Math.sin(n / 2);
      return 6371 * (2 * Math.atan2(Math.sqrt(i), Math.sqrt(1 - i)));
    }, e.prototype.isMarkerInBounds_ = function (t, e) {
      return e.contains(t.getPosition());
    }, e.prototype.addToClosestCluster_ = function (t) {
      for (var e = 4e4, r = null, n = 0; n < this.clusters_.length; n++) {
        var i,
            o = (i = this.clusters_[n]).getCenter();

        if (o) {
          var s = this.distanceBetweenPoints_(o, t.getPosition());
          s < e && (e = s, r = i);
        }
      }

      r && r.isMarkerInClusterBounds(t) ? r.addMarker(t) : ((i = new Hr(this)).addMarker(t), this.clusters_.push(i));
    }, e.prototype.createClusters_ = function (t) {
      var e = this;

      if (this.ready_) {
        var r;
        0 === t && (google.maps.event.trigger(this, "clusteringbegin", this), void 0 !== this.timerRefStatic && (clearTimeout(this.timerRefStatic), delete this.timerRefStatic)), r = this.getMap().getZoom() > 3 ? new google.maps.LatLngBounds(this.getMap().getBounds().getSouthWest(), this.getMap().getBounds().getNorthEast()) : new google.maps.LatLngBounds(new google.maps.LatLng(85.02070771743472, -178.48388434375), new google.maps.LatLng(-85.08136444384544, 178.00048865625));

        for (var n = this.getExtendedBounds(r), i = Math.min(t + this.batchSize_, this.markers_.length), o = t; o < i; o++) {
          var s = this.markers_[o];
          !s.isAdded && this.isMarkerInBounds_(s, n) && (!this.ignoreHidden_ || this.ignoreHidden_ && s.getVisible()) && this.addToClosestCluster_(s);
        }

        if (i < this.markers_.length) this.timerRefStatic = window.setTimeout(function () {
          e.createClusters_(i);
        }, 0);else {
          delete this.timerRefStatic, google.maps.event.trigger(this, "clusteringend", this);

          for (o = 0; o < this.clusters_.length; o++) {
            this.clusters_[o].updateIcon();
          }
        }
      }
    }, e.CALCULATOR = function (t, e) {
      for (var r = 0, n = t.length, i = n; 0 !== i;) {
        i = Math.floor(i / 10), r++;
      }

      return r = Math.min(r, e), {
        text: n.toString(),
        index: r,
        title: ""
      };
    }, e.withDefaultStyle = function (t) {
      return _qe({
        textColor: "black",
        textSize: 11,
        textDecoration: "none",
        textLineHeight: t.height,
        fontWeight: "bold",
        fontStyle: "normal",
        fontFamily: "Arial,sans-serif",
        backgroundPosition: "0 0"
      }, t);
    }, e.BATCH_SIZE = 2e3, e.BATCH_SIZE_IE = 500, e.IMAGE_PATH = "../images/m", e.IMAGE_EXTENSION = "png", e.IMAGE_SIZES = [53, 56, 66, 78, 90], e;
  }(Br);
}();
'use strict';

window.LocatorMap = ( () => {
  const DEBUG_MODE = false;
  const GM_EVENT = google.maps.event;

  const DEFAULT_MAP_OPTIONS = Object.freeze( {
    disableDefaultUI: true,
    zoomControl: true,
    maxZoom: 17,
    minZoom: 4,
    isFractionalZoomEnabled: true,

    styles: [
      {
        featureType: "poi.business",
        stylers: [ { visibility: "off" } ],
      },
      {
        featureType: "transit",
        elementType: "labels.icon",
        stylers: [ { visibility: "off" } ],
      },
    ]
  } );

  const MAP_PADDING_PX = Object.freeze( {
    bottom: 7,
    left: 15,
    top: 43,
    right: 15
  } );

  const MAP_FUDGING_PX = Object.freeze( Object.fromEntries(
    Object.entries( MAP_PADDING_PX ).map( entry => [ entry[0], Math.ceil( 1.2 * entry[1] ) ] )
  ) );

  const PANZOOM_KEYS = Object.freeze( [
    'ArrowUp',    'PageUp',   // NORTH
    'ArrowRight', 'End',      // EAST
    'ArrowLeft',  'Home',     // WEST
    'ArrowDown',  'PageDown', // SOUTH
    '+',          '-'         // ZOOM IN/OUT
  ] );

  const MARKER_MODES = Object.freeze( {
    radialSearch: 'RADIAL_SEARCH',
    single:       'SINGLE',
    state:        'STATE'
  } );

  const MRK_ELEMENT_SELECTOR = 'div[role=button]';
  const LOCATION_MARKERS = [];

  let opts, gmap, markerBounds, currentOuterMarker;
  let exploredOuterIndex = 0;
  let bcHandlerActive = true;
  let fitBoundsLock = false;
  let recallIndex = 0;
  let recallBounds;

  const _private = {
    init: ( options = {} ) => {
      opts = options;
      gmap = new google.maps.Map( opts.$container.get(0), { ...DEFAULT_MAP_OPTIONS, ...opts.mapOptions}  );

      if ( opts.reCenterCallback ) {
        // Couple of quickie helper functions, for clarity re: what we do below:
        function pause() { bcHandlerActive = false; };
        function resume() { bcHandlerActive = true; _private.handleBoundsChanged(); };  // invoke handler explicitly, in case resume happens after bounds_changed event has fired

        // Set up a handler for when we pan/zoom the map:
        GM_EVENT.addListener( gmap, 'bounds_changed', _private.handleBoundsChanged );

        // Additional voodoo to ensure bounds_changed handler PAUSES while keyboard-driven pan/zoom in progress:
        GM_EVENT.addListener( gmap, 'tilesloaded', () => {  // find newly-rendered map tiles, because keydown
          opts.$container.find( 'div[role="region"]' )      // events don't bubble up to the container
            .off( 'keydown' )   // remove any previously-set binding, since we don't know which tiles are still visible
            .on( 'keydown', ev => PANZOOM_KEYS.includes( ev.key ) ? pause() : true );
        } );

        // Additional voodoo to ensure bounds_changed handler RESUMES when keyboard-driven pan/zoom completes:
        opts.$container.on( 'keyup', ev => PANZOOM_KEYS.includes( ev.key ) ? resume() : true );

        // Likewise for mouse/touch drag events:
        GM_EVENT.addListener( gmap, 'dragstart', pause );
        GM_EVENT.addListener( gmap, 'dragend', resume );

        // Support keyboard navigation among markers too:
        opts.$container.on( 'focus', MRK_ELEMENT_SELECTOR, ev => $( ev.currentTarget ).trigger( 'click' ) );
      }
    },

    initMarkers: ( lat, lng, settings = {} ) => {
      LOCATION_MARKERS.forEach( marker => marker.setMap( null ) );  // remove existing markers from the map
      LOCATION_MARKERS.length = 0;   // empty the array
      markerBounds = new google.maps.LatLngBounds();
      exploredOuterIndex = 0;
      isFinite( lat ) && isFinite( lng ) && _private.createMarker( lat, lng, settings );
    },

    createMarker: ( lat, lng, settings = {} ) => {
      // Prep for the marker:
      const POS = new google.maps.LatLng( lat, lng );
      markerBounds.extend( POS );

      const MARKER_OPTIONS = {
        visible: true,
        position: POS,
        title: settings.title,
        opacity: 1
      };

      settings.labelText && ( MARKER_OPTIONS.label = { text: settings.labelText } );

      switch ( settings.mode ) {
        case MARKER_MODES.radialSearch:
          MARKER_OPTIONS.visible = false;
          MARKER_OPTIONS.icon = opts.markerIconDefaultSrc;
          MARKER_OPTIONS.label && ( MARKER_OPTIONS.label.className = 'locator-pin-label' );
          break;

        case MARKER_MODES.state:
          MARKER_OPTIONS.label && ( MARKER_OPTIONS.label.color = '#FFF' );

          MARKER_OPTIONS.icon = {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: '#7C6992',
            fillOpacity: 1,
            strokeWeight: 0,
            scale: 12
          };
      }

      // The marker itself:
      const MARKER = new google.maps.Marker( MARKER_OPTIONS );
      MARKER.setMap( gmap );
      MARKER.minBounds = markerBounds.toJSON(); // \
      MARKER.index = LOCATION_MARKERS.length;   // |- custom properties for use by other LocatorMap methods
      MARKER.$card = settings.$card;            // /
      LOCATION_MARKERS.push( MARKER );

      // Event handlers:
      switch ( settings.mode ) {  // I know, I know...  we'll have it all better organized when we move to ui.frontend
        case MARKER_MODES.radialSearch:
          MARKER.setZIndex( -MARKER.index );
          GM_EVENT.addListener( MARKER, 'click',     () => _private.spotlightMarker( MARKER ) );
          GM_EVENT.addListener( MARKER, 'mouseover', () => _private.spotlightMarker( MARKER ) );
          GM_EVENT.addListener( MARKER, 'mouseout',  () => _private.unlightMarker(   MARKER ) );
          MARKER.$card?.on( 'mouseover mouseout', ev => GM_EVENT.trigger( MARKER, ev.type ) );

        case MARKER_MODES.state:
          GM_EVENT.addListener( MARKER, 'click', () => MARKER.$card?.trigger( 'markerClick' ) );  // we bind this one in either case, since no "break" above
      }
    },

    ...( () => {
      const SPOTLIT = [];

      return {
        spotlightMarker: marker => {
          let lit;
          while ( lit = SPOTLIT.shift() ) _private.unlightMarker( lit );

          marker.setIcon( opts.markerIconSpotlightSrc );
          marker.getLabel().color = '#FFF';
          marker.setZIndex( google.maps.Marker.MAX_ZINDEX );
          marker.$card.addClass( 'marker-mouseover' );
          SPOTLIT.push( marker );
        },

        unlightMarker: marker => {
          marker.setIcon( opts.markerIconDefaultSrc );
          delete marker.getLabel().color;
          marker.setZIndex( -marker.index );
          marker.$card.removeClass( 'marker-mouseover' );
        }
      };
    } )(),

    fitToIndex: ( index = recallIndex ) => {
      ( index >= 0 ) && ( recallIndex = parseInt( index ) );  // keep requested index (even if we end up bailing on fit operation)
      recallBounds = undefined;
      _private.safelyFitBounds( LOCATION_MARKERS[recallIndex]?.minBounds, MAP_FUDGING_PX );
    },

    restoreBounds: () => ( recallBounds ? _private.safelyFitBounds( recallBounds ) : _private.fitToIndex() ),

    safelyFitBounds: ( bounds, padding = 0 ) => {
      if ( fitBoundsLock || opts.$container.is( ':hidden' ) ) return;  // bail out if we have a fit already in progress, or if map is hidden

      try {
        fitBoundsLock = true;
        gmap.fitBounds( bounds, padding );
      }
      catch ( err ) {
        fitBoundsLock = false;
        console.warn( err );
      }
    },

    ensureMarkerVisible: index => (
      !LOCATION_MARKERS[index].getVisible() && _private.fitToIndex( Math.max( index, currentOuterMarker?.index ) )
    ),

    // Handler for when we pan/zoom the map:
    handleBoundsChanged: ( () => {
      const EXPLORED_RECTANGLE = new google.maps.Rectangle( { strokeWeight: 0, visible: DEBUG_MODE } );
      const SMB_RECTANGLE = new google.maps.Rectangle( { strokeWeight: 0, fillColor: 'purple', visible: DEBUG_MODE } );
      let priorViewSpec, scaledMarkerBounds;

      return () => {
        // Bail out if...
        if ( !bcHandlerActive ) return;  // ...we're paused due to keydown or dragging state (see also comments for init() method above)

        const mapBounds = gmap.getBounds();
        if ( mapBounds == null ) return;  // ...map not yet bounded; nothing to do

        const currentViewSpec = mapBounds.toString();
        if ( currentViewSpec == priorViewSpec ) return;  // ...current bounds match prior bounds; no need to recompute

        if ( !isMarkerVisible( LOCATION_MARKERS[0], mapBounds ) ) {
          let center = gmap.getCenter();
          let exploredBounds = EXPLORED_RECTANGLE.getBounds();

          if ( exploredBounds && !exploredBounds.contains( center ) ) {
            opts.reCenterCallback && opts.reCenterCallback( center.toJSON() );
            return;   // ...origin marker is outside viewable area, AND map center is outside explored bounds; so call back with new map center
          }
        }

        // Still here?  Remember current bounds, then update marker visibility, etc:
        priorViewSpec = currentViewSpec;
        LOCATION_MARKERS.slice(1).forEach( marker => ( isMarkerVisible( marker ) && ( currentOuterMarker = marker ) ) );
        opts.$container.find( MRK_ELEMENT_SELECTOR ).attr( 'alt', ( i, elem ) => $( elem ).find( '>img' ).attr( 'alt' ) );

        if ( currentOuterMarker?.index > exploredOuterIndex ) {
          exploredOuterIndex = currentOuterMarker.index;
          EXPLORED_RECTANGLE.getMap() || EXPLORED_RECTANGLE.setMap( gmap );
          EXPLORED_RECTANGLE.setBounds( currentOuterMarker.minBounds );
        }

        !fitBoundsLock && currentOuterMarker?.$card?.trigger( 'markerVisible' );
        recallBounds = mapBounds;
        fitBoundsLock = false;
      }

      function isMarkerVisible( marker, mapBounds ) {
        if ( mapBounds ) {
          const swne = mapBounds.toJSON();
          const center = mapBounds.getCenter().toJSON();
          const divHalfHeightPx = opts.$container?.height() / 2;
          const divHalfWidthPx  = opts.$container?.width()  / 2;

          scaledMarkerBounds = new google.maps.LatLngBounds( {
            south: getScaledBoundaryCoord( divHalfHeightPx, MAP_PADDING_PX.bottom, swne?.south, center?.lat ),
            west:  getScaledBoundaryCoord( divHalfWidthPx,  MAP_PADDING_PX.left,   swne?.west,  center?.lng ),
            north: getScaledBoundaryCoord( divHalfHeightPx, MAP_PADDING_PX.top,    swne?.north, center?.lat ),
            east:  getScaledBoundaryCoord( divHalfWidthPx,  MAP_PADDING_PX.right,  swne?.east,  center?.lng )
          } );

          SMB_RECTANGLE.getMap() || SMB_RECTANGLE.setMap( gmap );
          SMB_RECTANGLE.setBounds( scaledMarkerBounds );
        }

        let visible = scaledMarkerBounds.contains( marker.getPosition() );
        marker.setVisible( visible );
        return visible;
      }

      function getScaledBoundaryCoord( divHalfPx, paddingPx, mapEdgeCoord, mapCenterCoord ) {
        return ( 1 - paddingPx/divHalfPx ) * ( mapEdgeCoord - mapCenterCoord ) + mapCenterCoord;
      }
    } )(),

    clusterMarkers: () => {
      _private.fitToIndex( LOCATION_MARKERS.length - 1 );

      new MarkerClusterer( gmap, LOCATION_MARKERS, {
        averageCenter: true,
        styles: [ { width: 30, height: 30, className: 'cluster-marker', anchorText: [ 5, 0 ] } ],

        calculator: markers => {
          const REDUCER = ( sum, marker ) => ( sum + parseInt( `0${marker.getLabel().text}` ) );
          const AGGREGATE_LABEL = String( markers.reduce( REDUCER, 0 ) );

          return { text: AGGREGATE_LABEL, index: 1 };
        }
      } );
    },
  };

  return {
    init: _private.init,
    fitToIndex: _private.fitToIndex,
    restoreBounds: _private.restoreBounds,

    initMarkers: _private.initMarkers,
    createMarker: _private.createMarker,
    ensureMarkerVisible: _private.ensureMarkerVisible,
    clusterMarkers: _private.clusterMarkers,
  };
} )();

'use strict';
/*
# NOTES
- In some cases, we reference object members as ['name'] rather than .name because the latter trips up YUI compressor.
*/
window.Locator = ( () => {
  window.location.href.endsWith( '?' ) && history.pushState( {}, null, window.location.href.slice( 0, -1 ) );   // that voodoo that you do

  const DEFAULT_PG_LOC_TYPE = 'branch';
  const CURRENT_PAGE_URL = new URL( window.location );
  const RELAY_PARAMS = new URLSearchParams( CURRENT_PAGE_URL.search );

  const DISPLAY_MODE_ATTR = 'data-mode';
  const RESULTS_MODE = 'results';
  const NO_RESULTS_MODE = 'noresults';
  const WAITING_MODE = 'waiting';
  const CITY_LIST_MODE = 'city-list';

  const BASE_PARAMS = {
    returnBranchATMStatus: 'Y',
    maxResults: 100,
    searchRadius: 200
  };

  const MIN_PAGE_RADIUS = 10;   // miles
  const MAX_RESULT_PAGE_LENGTH = 10;  // locations
  const RESULT_CARD_SELECTOR = '.card';

  const SFSK = LocatorUtils.SEARCH_FORM_SESSION_KEY;
  const SESSION_PARAMS = LocatorUtils.getParamsFromSession( SFSK );

  let filterParams = ( SESSION_PARAMS.bal_filters || {} );
  let applyFilter = false;

  let $cmp, $innerCmp;
  let $filterFormContainer, $filterForm, $filterDialogTrigger, $locationTypes;
  let $statusContainer, $resultListWrapper, $loadMore;
  let $resultList = $();
  let $cardCloner, cardTemplate;

  //===\/\/\/=== CITY LIST ===\/\/\/===
  let $cityWrapper = $();
  let $cityLinks = $();
  //===/\/\/\=== CITY LIST ===/\/\/\===

  //---------------------------------------
  const _private = {
    //---------------------------------------
    //--- INIT/SETUP ---
    init: async () => {
      // Contain yourself!
      $cmp = $( '.branch-locator-container' ).first();
      $innerCmp = $cmp.find( '.locator-component' );
      $statusContainer = $cmp.find( '.show-results-number' );

      // Result list event handling:
      $resultListWrapper = $cmp.find( '.result-list-item-view >.resultlist-index' );
      $resultListWrapper.on( 'click:a11y',    RESULT_CARD_SELECTOR, _private.handleCardClick );
      $resultListWrapper.on( 'focusin',       RESULT_CARD_SELECTOR, ev => LocatorMap.ensureMarkerVisible( $( ev.currentTarget ).data( 'markerIndex' ) ) );
      $resultListWrapper.on( 'markerVisible', RESULT_CARD_SELECTOR, ev => _private.revealPage( $( ev.currentTarget ).data( 'page' ) )                   );
      $resultListWrapper.on( 'markerClick',   RESULT_CARD_SELECTOR, ev => _private.revealCard( $( ev.currentTarget )                )                   );

      $resultListWrapper.on( 'click:a11y', 'a.js-detail-link, a.detail-button', _private.handleViewDetails  );
      $resultListWrapper.on( 'click:a11y', '.see-more-accordion >a', _private.seeMoreToggle );
      $resultListWrapper.on( 'click:a11y', 'a[href^="tel:"], a.makeapp-btn', $.noop );
      $resultListWrapper.on( 'click:a11y', 'a.get-direction', LocatorUtils.openGetDirectionsModal );

      $resultListWrapper.on( 'click:a11y', '.js-location-status', LocatorUtils.openStatusModal );
      $resultListWrapper.on( 'click:a11y', '.js-location-status', _private.onSetInformationIcon );
      $resultListWrapper.on( 'click:a11y', '.js-location-status', function( ev ) {
        $( this ).closest( '.branch-locator-component' ).find( '.js-location-status-msg .close-icon-popup' ).attr( 'tabindex', 0 ).css( 'border', '1px solid outline' ).focus();
      } );

      $cmp.find( '.js-location-status-msg .close-icon-popup' ).on( 'click:a11y', _private.informationIcon );
      $loadMore = $cmp.find( '.load-more-button >button' ).on( 'click:a11y',  _private.handleMoreClick );
      $cmp.find( '.show-less-button >a' ).on( 'click:a11y',  _private.handleFewerClick );

      // Filter form event handling (etc):
      const $FILTER_BUTTON = $cmp.find( '.filter-button-badge' );
      const $FBT = $FILTER_BUTTON.find( '.filter-button-text' );
      const FBT_WORDS = $FBT.text().trim().split( /\s+/ );
      $FBT.html( `${FBT_WORDS.shift()}<span> ${FBT_WORDS.join( ' ' )}</span>` );  // work-around for lack of a "first word" selector in CSS

      $FILTER_BUTTON.on( 'click', _private.openFilterDialog );
      $cmp.find( '.get-filter-location' ).on( 'click', _private.openFilterDialog );

      $filterFormContainer = $cmp.find( '.filter-popup-container' );
      $filterForm = $filterFormContainer.find( '>form' );
      $filterForm.find( '.filter-popup-close-icon svg' ).on( 'click:a11y', _private.closeFilterDialog );
      $locationTypes = $filterForm.find( 'input[name="locationType"]' ).on( 'change', _private.handleLocationTypeChange );

      $filterForm.find( '.flex-format-container ul li' )
        .on( 'keyup focusin', _private.handleServiceKeyupEvent )
        .on( 'keydown focusout', _private.handleServicefocusEvent );

      $filterForm.find( '.flex-format-container input:checkbox' ).on( 'change', _private.handleServiceCheckMarkChange );
      $filterForm.find( 'button' ).on( 'click:a11y', _private.handleApplyFilters );

      // Mobile view event handling:
      $cmp.find( '.map-view-toggle'  ).on( 'click', _private.mapViewToggle  );
      $cmp.find( '.back-view-toggle' ).on( 'click', _private.listViewToggle );
      $( window ).on( 'resize', _private.handleResize ).trigger( 'resize' );

      // Determine initial search parameters from url and/or session data:
      const [ PG_LOC_TYPE, IS_ST_LEVEL, PD_INPUT, TA_PARTS ] = _private.getSearchInitializers();

      // Initialize filters:
      $filterForm.find( '.reset-filter >a' ).on( 'click:a11y', { defaultType: PG_LOC_TYPE }, _private.handleReset );
      PG_LOC_TYPE && ( filterParams.locationType = PG_LOC_TYPE );

      Object.entries( filterParams ).forEach(
        ( [ key, csv ] ) => $filterForm.find( `[name=${key}]` ).val( csv.split( ',' ) ).trigger( 'change' )
      );

      // Initialize map:
      const BUILD_SVG_DATA_URI = ( $yo => `data:image/svg+xml;utf8,${encodeURIComponent( $yo.prop( 'outerHTML' ) )}` );
      $cardCloner = $cmp.find( `#cloners >${RESULT_CARD_SELECTOR}` );
      cardTemplate = $cardCloner.prop( 'outerHTML' );   // we'll use this later to build result list

      LocatorMap.init( {
        $container: $cmp.find( 'div.map-view' ),
        reCenterCallback: ( IS_ST_LEVEL ? $.noop : _private.mapReCenterCallback ),
        markerIconDefaultSrc:   BUILD_SVG_DATA_URI( $cardCloner.find( '.locator-icon-default'   ) ),
        markerIconSpotlightSrc: BUILD_SVG_DATA_URI( $cardCloner.find( '.locator-icon-spotlight' ) )
      } );

      //===\/\/\/=== CITY LIST ===\/\/\/===
      if ( IS_ST_LEVEL ) {
        const ST = TA_PARTS.administrative_area_level_1;

        // Analytics:
        marTech.trackState( {
          pageName: `truist|com${CURRENT_PAGE_URL.pathname.replace( /\//g, '|' ).replace( /-/g, '_' )}`,
          locatorSearchTerm: ST,
          locatorSearchType: 'locator_search',
          events: 'event78'
        } );

        // Init:
        let latSum = 0, lngSum = 0, markerCount = 0;
        LocatorMap.initMarkers();
        $cityWrapper = $cmp.find( '.result-list-item-view >.citylist-index' );
        $cityWrapper.find( '>nav' ).has( 'ul.citylist-content >li' ).addClass( 'show' );  // ^1^
        $cityLinks = $cityWrapper.find( 'a' );

        $cityWrapper.on( 'click:a11y', 'ul.citylist-container button', ev => {
          const $ME = $( ev.currentTarget );
          const $CONTENT = $ME.closest( 'ul.citylist-container' ).find( '.citylist-content' );
          const SHOW = $CONTENT.hasClass( 'hide' );

          $ME.attr( 'aria-expanded', SHOW ).find( 'svg' ).toggleClass( 'is-rotated', SHOW );
          $CONTENT.toggleClass( 'hide', !SHOW );
          SHOW && $CONTENT.find( 'li:first-child a' ).focus();
          return false;
        } );

        $cityLinks.each( ( i, elem ) => {
          const $ME = $( elem );
          const LAT = $ME.data( 'lat' );
          const LNG = $ME.data( 'lng' );

          const LINK = new URL( $ME.get(0) );
          const CITY_NAME = $ME.text().trim();
          LINK.search = RELAY_PARAMS.toString();
          $ME.attr( 'href', LINK.href );

          $ME.on( 'click:a11y markerClick', ev => {
            const CITY_PD_INPUT = {
              textAddress: _private.getCitySearchText( CITY_NAME, ST ),
              lat: LAT,
              lng: LNG
            };

            const CITY_PD = LocatorUtils.getAugmentedPD( CITY_PD_INPUT, { ...TA_PARTS, locality: CITY_NAME } );
            LocatorUtils.updateSessionSearchOrigin( CITY_PD ).then( () => ( window.location = $ME.attr( 'href' ) ) );
            return false;
          } );

          LocatorMap.createMarker( LAT, LNG, {
            mode: 'STATE',
            $card: $ME,
            labelText: String( $ME.data( 'count' ) ),
              title: CITY_NAME
          } );

          latSum += parseFloat( LAT );
          lngSum += parseFloat( LNG );
        } );

        // Populate map, set some flags, etc:
        [ PD_INPUT.lat, PD_INPUT.lng ] = [ latSum, lngSum ].map( sum => Number( sum / $cityLinks.length ).toFixed( 4 ) );
        _private.updateResultStatus( $cityLinks.length );
        _private.setDisplayMode( $cityLinks.length ? CITY_LIST_MODE : NO_RESULTS_MODE );
        LocatorMap.clusterMarkers();
      }
      //===/\/\/\=== CITY LIST ===/\/\/\===

      // Initialize autocomplete:
      const PD = LocatorUtils.getAugmentedPD( PD_INPUT, TA_PARTS );
      $cmp.data( 'pgCity' ) && _private.citySanitation( PD );

      await LocatorAutocomplete.init( {
        $container: $cmp.find( 'form.google-search-form' ),
        positionData: PD,
        callback: ( IS_ST_LEVEL ? $.noop : _private.autocompleteCallback ),

        locationTypeDir: ( PG_LOC_TYPE || DEFAULT_PG_LOC_TYPE ),
        footprint: _private.getFootprint(),
        relayParams: RELAY_PARAMS
      } );

      IS_ST_LEVEL ? LocatorUtils.updateSessionSearchOrigin( PD ) : _private.handleApplyFilters();
    },

    getFootprint: ( () => {
      let footprint;

      return ( () => {
        const REDUCER = ( ( acc, tag ) => {
          const $TAG = $( tag );
          acc[ $TAG.data( 'name' ) ] = acc[ $TAG.data( 'abbr' ) ] = $TAG.data();
          return acc;
        } );

        footprint || ( footprint = $cmp.find( '#cloners >#footprint >span' ).get().reduce( REDUCER, {} ) );
        return footprint;
      } );
    } )(),

    getSearchInitializers: () => {
      const { pgLocationType: PG_LOC_TYPE, pgState: PG_STATE, pgCity: PG_CITY, pgZip: PG_ZIP } = $cmp.data();   // data attribute will have been populated with address parts derived from url, if present
      const ST_INFO = _private.getFootprint()[PG_STATE];
      const SESSION_TEXT_ADDRESS = SESSION_PARAMS.textAddress?.[0];

      const [ IS_ST_LEVEL, TEXT_ADDRESS ] = ( () => {
        switch ( true ) {
          case !ST_INFO: return [ false, SESSION_TEXT_ADDRESS ];  // no valid footprint state in url, so we use prior user-entered search text from session, if any
          case !PG_CITY: return [ true,  ST_INFO.displayName  ];  // url provides valid state but no city, so we're doing state-level search
          case !PG_ZIP:  return [ false, _private.getCitySearchText( PG_CITY, PG_STATE ) ]; // url provides state and city but no zip, so we're doing city-level search
          default:       return [ false, PG_ZIP               ];  // url provides state, city, and zip, so we're going zip-level search
        }
      } )();

      const PD_INPUT = { textAddress: TEXT_ADDRESS };
      const IS_REPEAT = ( TEXT_ADDRESS === SESSION_TEXT_ADDRESS );
      IS_REPEAT && ( [ PD_INPUT.lat, PD_INPUT.lng ] = ( SESSION_PARAMS.latlng?.[0]?.split( ',' ) || [] ) );   // if our url-derived TEXT_ADDRESS matches what we already have in session data, we can keep the lat,lng too, so we don't have to geocode again

      const TA_PARTS = {
        administrative_area_level_1: ( PG_STATE || ( IS_REPEAT ? SESSION_PARAMS.state?.[0] : undefined ) ),
        locality:                    ( PG_CITY  || ( IS_REPEAT ? SESSION_PARAMS.city?.[0]  : undefined ) ),
        postal_code:                 ( PG_ZIP   || ( IS_REPEAT ? SESSION_PARAMS.zip?.[0]   : undefined ) )
      };

      return [
        PG_LOC_TYPE,
        IS_ST_LEVEL,
        PD_INPUT,
        ( Object.values( TA_PARTS ).some( val => !!val ) ? TA_PARTS : {} )
      ];
    },

    getCitySearchText: ( cityName, stAbbr ) => `${TextFormatUtils.format( cityName, 'title' )}, ${stAbbr}`,

    citySanitation: async pd => {   // extra sanity-check for city- and zip-level urls
      const { textAddressParts: TEXT_ADDRESS_PARTS } = await pd.textAddressPromise;

      TEXT_ADDRESS_PARTS.locality ?
        $cmp.find( '.locator-header-city' ).text( `${TEXT_ADDRESS_PARTS.locality},` ) :
        ( window.location = '/locator-error' );
    },

    //---------------------------------------
    //--- SEARCH FORM AND MAP CALLBACKS ---
    autocompleteCallback: ( pd = {} ) => {
      pd.latlngPromise.then( latlngData => {
        let latlng = latlngData.latlng;

        _private.doLocationSearch( { lat: latlng.lat, long: latlng.lng } )
          .done( searchResultData => {
              LocatorMap.initMarkers( latlng.lat, latlng.lng, { title: 'Starting point of your search' } );

              pd.textAddressPromise.then( textAddressData => {
                _private.handleLocationSearchResults( searchResultData, textAddressData.textAddress, pd.searchButtonClick );
                LocatorUtils.autoScroll( $cmp );
              } );
            } )
          .fail( _private.handleError );
      } );
    },

    mapReCenterCallback: ( center = {} ) => {
      const PD = LocatorUtils.getAugmentedPD( {
        ...center,
        options: {
          preprocess: ( ta, tap ) =>
            `${tap.locality||''}, ${tap.administrative_area_level_1||''} ${tap.postal_code||''}`
              .replace( /^\W+/, '' )  // purge both leading and trailing non-word characters,
              .replace( /\W+$/, '' )  // in a manner which pleases the SonarQube
        }
      } );

      LocatorAutocomplete.safeUpdate( PD );
      LocatorUtils.updateSessionSearchOrigin( PD );

      _private.doLocationSearch( { lat: center.lat, long: center.lng } )
        .done( searchResultData => {
          LocatorMap.initMarkers( center.lat, center.lng, { title: 'Starting point of your search' } );
          PD.textAddressPromise.then( obj => _private.handleLocationSearchResults( searchResultData, obj.textAddress, false ) );
        } )
        .fail( _private.handleError );
    },

    //---------------------------------------
    //--- SEARCH API CALLOUT ---
    doLocationSearch: ( function() {
      let jqxhr, locatorAPI;

      return ( originParams = {} ) => {
        // (0) Init:
        locatorAPI || ( locatorAPI = $innerCmp.data( 'locator-api' ) );

        // (1) Prepare to do the things:
        const API_FILTER_PARAMS = structuredClone( filterParams );
        API_FILTER_PARAMS.locationType = ( filterParams.locationType?.toUpperCase() || 'BOTH' );

        const PARAMS = { ...BASE_PARAMS, ...API_FILTER_PARAMS, ...originParams };
        const QUERY = Object.keys( PARAMS ).map( key => `${key}=${encodeURIComponent( PARAMS[key] )}` ).join( '&' );
        _private.setDisplayMode( WAITING_MODE );
        jqxhr && jqxhr.abort();

        // (2) Do the things:
        jqxhr = $.get( {
          url: `${locatorAPI}?${QUERY}`,
          dataType: 'json'
        } );

        return jqxhr;
      }
    } )(),

    //---------------------------------------
    //--- SEARCH CALLBACK ---
    handleLocationSearchResults: ( data, searchOriginAddress, searchButtonClick ) => {
      if ( data.error ) return _private.handleError( data.error );

      let locations = data.location;

      // Analytics:
      if ( !locations?.length && !applyFilter ) {
        // Analytics when no search results:
        _private.makeAnalyticsCall( 'noresult', searchOriginAddress, searchButtonClick );
      }
      else if ( applyFilter ) {
        // Apply button click
        _private.makeAnalyticsCall( 'apply', searchOriginAddress, searchButtonClick );
      }
      else {
        // Analytics on click of search button when we have results
        _private.makeAnalyticsCall( 'results', searchOriginAddress, searchButtonClick );
      }

      // If no results, inform the user, then bail out -- nothing more to do here:
      if ( !locations?.length ) {
        _private.updateResultStatus( '0 Result(s)' );
        _private.setDisplayMode( NO_RESULTS_MODE );
        $cmp.find( '.toggle-switch-map' ).hide();
        return;
      }

      // Make way for ducklings!
      _private.setDisplayMode( RESULTS_MODE );
      $resultList.remove();

      // Useful objects for building result list:
      const CHOSEN_HREF = LocatorUtils.getParamsFromSession( LocatorUtils.RESULT_LIST_SESSION_KEY ).href;
      const SPEED_BUMP_PARAMS = new URLSearchParams( RELAY_PARAMS.toString() );

      const LTTP = LocationTimeTableParser( {
        todayScheduleTemplate: $cmp.find( '#cloners >.js-location-today-container' ).html(),
        timeTableEntryTemplate: $cmp.find( '#cloners >.lobby-items' ).html(),
        statusLinkTemplate: $cmp.find( '#cloners >a.js-location-status' ).prop( 'outerHTML' )
      } );

      // Loopy variables:
      const alreadyGotOne = {};
      let markerIndex = 0;
      let page = -1;
      let pageRadius = -1;
      let newPageIndex = 1;
      let $preselectCard;

      // Build result list:
      $resultListWrapper.prepend( locations.map( loc => {
        const [ LOC, LOC_ADDR ] = LocatorUtils.scrubLocationObject( loc, searchOriginAddress );
        if ( alreadyGotOne[ LOC.href ] ) return;

        alreadyGotOne[ LOC.href ] = true;
        markerIndex++;

        if ( ( loc.locationDistance > pageRadius ) || markerIndex >= newPageIndex ) {
          page++;
          pageRadius = Math.max( Math.sqrt(2) * loc.locationDistance, MIN_PAGE_RADIUS );
          newPageIndex = markerIndex + MAX_RESULT_PAGE_LENGTH;
        }

        const DETAILS_URL = new URL( LOC.href, CURRENT_PAGE_URL.origin );
        DETAILS_URL.search = RELAY_PARAMS;
        LTTP.setLocation( LOC );
        SPEED_BUMP_PARAMS.set( 'url', LOC_ADDR.directionsHref );

        let $card = $( CommonUtils.fillTemplate( cardTemplate, [
          markerIndex,                                                                                          // 0
          LOC.displayName,                                                                                      // 1
          LOC_ADDR.fullStreetAddress.replace( '\n', '<br/>' ),                                                  // 2
          LOC_ADDR.city,                                                                                        // 3
          LOC_ADDR.state,                                                                                       // 4
          LOC_ADDR.zipCode,                                                                                     // 5
          ( /^[0\-]$/.test( LOC.phone ) ? '' : LOC.phone ),                                                     // 6
          LOC.locationDistance,                                                                                 // 7
          `${DETAILS_URL.pathname}${DETAILS_URL.search}`,                                                       // 8
          `${LOC.locationName}_${LOC.locationType}`.toLowerCase().replace( /\s/g, '_' ).replace( /\W/g, '' ),   // 9
          SPEED_BUMP_PARAMS.toString(),                                                                         //10
          LOC.locationType.toLowerCase(),                                                                       //11
          page,                                                                                                 //12

          LTTP.getTodayScheduleMarkup( 'lobbyHours',     'Lobby'      ),                                        //13
          LTTP.getTodayScheduleMarkup( 'atmHours',       'ATM'        ),                                        //14
          LTTP.getTodayScheduleMarkup( 'driveThruHours', 'Drive thru' ),                                        //15

          LTTP.getTimeTableMarkup( 'lobbyHours'     ),                                                          //16
          LTTP.getTimeTableMarkup( 'driveThruHours' ),                                                          //17
          LTTP.getTimeTableMarkup( 'atmHours'       ),                                                          //18

          LOC.makeApptQueryString,                                                                              //19
          LOC_ADDR.directionsHref                                                                               //20
        ] ) );

        const $TIME_TABLES = $card.find( 'ul.lobby-items' );
        const $EMPTY_TIME_TABLES = $TIME_TABLES.filter( ( i, elem ) => !$( elem ).text().trim() );

        ( $TIME_TABLES.length === $EMPTY_TIME_TABLES.length ) ?
          $card.find( '.seeMore-data' ).next().addBack().remove() :     // remove hours section altogether iff nothing to show
          $EMPTY_TIME_TABLES.closest( 'div.card-title-row' ).remove();  // otherwise, just remove empty timetables

        $card.find( '.tel-syntax a[href="tel:"]' ).parent().remove();
        $card.data( 'details', LOC );

        LocatorMap.createMarker( LOC_ADDR.lat, LOC_ADDR['long'], {
          mode: 'RADIAL_SEARCH',
          labelText: String( markerIndex ),
          title: LOC_ADDR.markerTitle,
          $card: $card
        } );

        ( ( markerIndex === 1 ) || ( LOC.href === CHOSEN_HREF ) ) && ( $preselectCard = $card );
        return $card;
      } ) );

      $resultList = $resultListWrapper.find( RESULT_CARD_SELECTOR );
      _private.updateResultStatus( 1, $resultList.length, searchOriginAddress );
      _private.revealCard( $preselectCard, true );
    },

    setDisplayMode: ( mode = '' ) => {
      LocatorAutocomplete.enableSearchButton( mode !== WAITING_MODE );
      const $PARTS = $cmp.find( `[${DISPLAY_MODE_ATTR}]` );
      const $SHOW = $PARTS.filter( `[${DISPLAY_MODE_ATTR}~=${mode}]` ).removeClass( 'hide' );
      $PARTS.not( $SHOW ).addClass( 'hide' );
    },

    updateResultStatus: ( () => {
      const FILLERS = [];
      let template;

      return ( ...newFillers ) => {
        template || ( template = $statusContainer.html() );
        Object.assign( FILLERS, newFillers.flat() );
        $statusContainer.html( CommonUtils.fillTemplate( template, FILLERS ) );
      }
    } )(),

    revealCard: ( $card, syncMap = false ) => {
      $card?.hasClass( 'hide' ) && _private.revealPage( $card.data( 'page' ), syncMap );
      $card && CommonUtils.rollTo( $card );
    },

    revealPage: ( page, syncMap = false ) => {
      let $toShow = $resultList.filter( `[data-page=${page}]` ).prevAll( RESULT_CARD_SELECTOR ).addBack();
      $toShow.removeClass( 'hide' ).not( '[data-page=0]' ).addClass( 'show' );   // no 'show' on page 0 since it determines visibility of "Show fewer" button

      let $outerCard = $toShow.last();
      $outerCard.nextAll( RESULT_CARD_SELECTOR ).removeClass( 'show' ).addClass( 'hide' );

      let outerIndex = $outerCard.data( 'markerIndex' );
      _private.updateResultStatus( outerIndex );
      syncMap && LocatorMap.fitToIndex( outerIndex );
    },

    handleMoreClick: () => {
      let $next = $resultList.filter( `${RESULT_CARD_SELECTOR}.hide` ).first();
      _private.revealPage( $next.data( 'page' ), true );
      $next.click();
      return false;
    },

    handleFewerClick: () => {
      _private.revealPage( $resultList.filter( `${RESULT_CARD_SELECTOR}.show` ).last().data( 'page' ) - 1, true );
      $resultList.filter( '.show' ).length || $loadMore.focus();
      return false;
    },

    //---------------------------------------
    //--- FILTER FORM HANDLERS ---
    openFilterDialog: ev => {
      $filterDialogTrigger = $( ev.currentTarget );
      $innerCmp.addClass( 'filter-dialog-active' );
      window.addEventListener( 'keydown', _private.filterDialogKeyboardHandler );   // activate filter dialog keyboard handling
      $filterForm.find( ':checked' ).trigger( 'focus' );   // focus on first checked element (ie, radio button for currently selected type)
      return false;
    },

    closeFilterDialog: () => {
      $innerCmp.removeClass( 'filter-dialog-active' );
      window.removeEventListener( 'keydown', _private.filterDialogKeyboardHandler );  // de-activate filter dialog keyboard handling
      $filterDialogTrigger?.trigger( 'focus' );
      return false;
    },

    filterDialogKeyboardHandler: ev => {
      if (ev.keyCode === 9) {
        let focusable = document.querySelector('#locatorfilter').querySelectorAll('input,button,select,textarea,a,[tabindex]:not([tabindex="-1"])');

        if (focusable.length) {
          let first = focusable[0];
          let last = focusable[focusable.length - 1];
          let shift = ev.shiftKey;

          if (shift) {
              if (ev.target === first) { // shift-tab pressed on first input in dialog
                  last.focus();
                  ev.preventDefault();
              }
          } else {
              if (ev.target === last) { // tab pressed on last input in dialog
                  first.focus();
                  ev.preventDefault();
              }
          }
        }
      }

      ( ev.keyCode === 27 ) && _private.closeFilterDialog();
    },

    handleServiceKeyupEvent: function(e) {

      if(e.keyCode === 9) {
            $(this).find('span').css('border','2px solid #5c5c5c'); /* Need to add border in CSS */
          }
    },

    handleServicefocusEvent: function(e) {

      if(e.keyCode === 9) {
            $(this).find('span').css('border','1px solid #5c5c5c'); /* Need to add border in CSS */
          }
    },

    handleServiceCheckMarkChange: ev => {
      const $ME = $( ev.currentTarget );
      $ME.attr( 'aria-checked', $ME.prop( 'checked' ) );
    },

    handleReset: ev => {            // reset explicitly here (rather than allow default behavior),
      $filterForm.get(0).reset();   // to ensure it happens before we trigger change handlers, etc
      $locationTypes.val( [ ev.data?.defaultType ] );
      $filterForm.find( 'input' ).trigger( 'change' );
      LocatorUtils.saveParamsToSession( SFSK, { 'bal_filters': undefined }, true );
      applyFilter = false;
      return false;
    },

    handleApplyFilters: ev => {
      const IS_CLICK_EVENT = !!( ev?.target );
      applyFilter = IS_CLICK_EVENT;

      const HOMINY = $filterForm.find( 'input[type=checkbox]:checked' ).not( ':disabled' ).length;
      $innerCmp.find( '.badge-count'  ).toggleClass( 'hide', HOMINY === 0 ).text( HOMINY );
      $innerCmp.find( '.context-text' ).toggleClass( 'hide', HOMINY === 0 );
      IS_CLICK_EVENT && ( _private.listViewToggle(), _private.closeFilterDialog() );

      const TMP = new URLSearchParams( $filterForm.serialize() );
      const REDUCER = ( ( acc, key ) => ( ( acc[key] = TMP.getAll( key ).join() ), acc ) );

      filterParams = Array.from( new Set( TMP.keys() ) ).reduce( REDUCER, {} );   // TODO: move this to a shared module
      LocatorUtils.saveParamsToSession( SFSK, { 'bal_filters': filterParams }, true );

      LocatorAutocomplete.activate( {
        locationTypeDir: ( filterParams.locationType || DEFAULT_PG_LOC_TYPE )
      } );

      return false;
    },

    handleLocationTypeChange: ev => {
      const $ME = $( ev.target );
      if ( !$ME.is( ':checked' ) ) { return; }  // sanity check for when we invoke the handler programmatically

      const LOCATION_TYPE = $ME.val();
      const LOCATION_CLASS = `js-${LOCATION_TYPE}`;
      const IS_ALL = !LOCATION_TYPE;

      $filterForm.find( '.branch-atm-validation input' ).each( ( i, elem ) => {
        const $MINE = $( elem );
        const ACTIVE = ( IS_ALL || $MINE.hasClass( LOCATION_CLASS ) );
        $MINE.attr( 'disabled', !ACTIVE ).closest( 'li' ).toggleClass( 'hide', !ACTIVE );
      } );

      //===\/\/\/=== CITY LIST ===\/\/\/===
      if ( IS_ALL ) { return; }

      $locationTypes.not( ':checked' ).each( ( lti, elem ) => {
        const UNTYPE = `/${$( elem ).val()}`;

        $cityLinks.filter( `[href*='${UNTYPE}']` )
          .attr( 'href', ( cli, href ) => href.replace( UNTYPE, `/${LOCATION_TYPE}` ) );
      } );
      //===/\/\/\=== CITY LIST ===/\/\/\===
    },

    //---------------------------------------
    //--- ADDITIONAL MISC UI HANDLERS ---
    mapViewToggle: ev => {
      $innerCmp.addClass( 'mobile-map-active' );
      $( ev.currentTarget ).next().trigger( 'focus' );  // move focus to list view button, since map view button is now hidden
      LocatorMap.restoreBounds();
      return false;
    },

    listViewToggle: () => ( $innerCmp.removeClass( 'mobile-map-active' ), false ),

    handleResize: ( () => {
      let winWidth;

      return ( () => {
        const WIN_WIDTH_NOW = window.innerWidth;
        if ( winWidth === WIN_WIDTH_NOW ) return;   // quick bail-out for false resize events in iOS

        winWidth = WIN_WIDTH_NOW;
        $statusContainer.toggleClass( 'sr-only', ( winWidth < 1024 ) );
      } );
    } )(),

    handleCardClick: ev => {
      const FOCUSABLE = 'a, button, [tabindex]';
      $( ev.target ).is( FOCUSABLE ) || $( ev.currentTarget ).find( FOCUSABLE ).first().trigger( 'focus' );
    },

    seeMoreToggle: ev => {
      const $ME = $( ev.currentTarget );
      const CONTENT_ID = $ME.data( 'contentId' );
      const IS_EXPANDING = ( $ME.attr( 'aria-expanded' ) === 'false' );

      $ME
        .attr( 'aria-expanded',     IS_EXPANDING ? 'true'     : 'false' )
        .attr( 'aria-describedby',  IS_EXPANDING ? CONTENT_ID : null    )
        .toggleClass( 'arrow-up-item',    IS_EXPANDING )
        .toggleClass( 'arrow-down-item', !IS_EXPANDING );

      $( ev.delegateTarget ).find( `#${CONTENT_ID}` ).toggleClass( 'hide', !IS_EXPANDING );
      return false;
    },

    onSetInformationIcon : function () {
		      $('.js-location-status').removeClass('atm-info');
          $(this).addClass('atm-info');
          window.addEventListener('keydown', _private.infoIconTabTrap);
    },

    informationIcon: function() {
      $( this ).closest( '.js-location-status-msg' ).parent().find( '.js-location-status.atm-info' )
        .attr( 'tabindex', 0 )
        .css( 'border', '1px solid outline' )
        .focus();
        window.removeEventListener('keydown', _private.infoIconTabTrap);
    },

    infoIconTabTrap: function(ev) {
        if (ev.keyCode === 9) {
           ev.preventDefault();
        }
    },

    handleViewDetails: ( ev = new MouseEvent() ) => {
      const CHOSEN_PARAMS = $( ev.target ).closest( RESULT_CARD_SELECTOR ).data( 'details' );
      CHOSEN_PARAMS.backLinkHref = CURRENT_PAGE_URL.href;
      LocatorUtils.saveParamsToSession( LocatorUtils.RESULT_LIST_SESSION_KEY, CHOSEN_PARAMS, true );
      return true;
    },

    handleError: function( jqxhr, status, err ) {
      if ( status == 'abort' ) return;  // this just means we cancelled one request to start another -- no need for error message

      console.error( err );
      _private.setDisplayMode( NO_RESULTS_MODE );
    },

    //---------------------------------------
    //--- WA HELPERS ---
    makeAnalyticsCall: ( () => {
      let locatorPagePath;

      return ( mode, searchText, searchButtonClick ) => {
        const WA_SEARCH_TEXT = searchText.replace( /[^A-Z0-9]+/ig, '_' ).toLowerCase();
        if ( ( WA_SEARCH_TEXT === SESSION_PARAMS.bal_waSearchText ) && ( mode !== 'apply' ) ) return;   // bail out iff repeating prior searchterm and not applying filter

        LocatorUtils.saveParamsToSession( SFSK, { bal_waSearchText: WA_SEARCH_TEXT }, true );

        let cdata = {};
        let afp = _private.getAnalyticsFilterParam();
        !locatorPagePath && ( locatorPagePath = $innerCmp.data( 'locatorPage' ) );

        cdata.pageName = 'truist|com' + ( window.location.pathname.includes( locatorPagePath ) ?
          '|locator_search_results' :
          window.location.pathname.replace( /\//g, '|' )
        );

        switch ( mode ) {
          case 'noresult':
            cdata.locatorSearchType = "locator_search" //capture the search type
            cdata.locatorSearchTerm = WA_SEARCH_TEXT;  // capture the search term
            cdata.locatorSearchExtraInfo = afp; // filter details
            cdata.events = "event78,event79";

            searchButtonClick ? marTech.trackAction( cdata ) : marTech.trackState( cdata );
            return;

          case 'apply':
            cdata.linkName = "apply";
            cdata.linkType = "interaction";
            cdata.linkPositon = "locator_search|narrow_down_search";
            cdata.linkExtraInfo = afp;

            marTech.trackAction( cdata );
            applyFilter = false;  //reset apply filter
            return;

          default:  // analytics on click of search button - when results are available
            cdata.locatorSearchType = "locator_search"; //capture the search type
            cdata.locatorSearchTerm = WA_SEARCH_TEXT; // capture the search term
            cdata.locatorSearchExtraInfo = afp; // filter details
            cdata.events = "event78";  // All branch locator searches

            searchButtonClick ? marTech.trackAction( cdata ) : marTech.trackState( cdata );
        }
      }
    } )(),

    getAnalyticsFilterParam: function() {
      var afpArray = [];

      if ( filterParams.options ) {
        let options = filterParams.options.split( ',' );

        options.forEach( option => {
          let filterelement = $filterFormContainer.find( `input[value='${option.trim()}']` ).data( 'analytics' );
          afpArray.push( `fl:${filterelement}` );
        } );
      }

      if ( filterParams.locationType ) {
        afpArray.push( `opt:${filterParams.locationType}` );
      }

      if ( filterParams.searchRadius ) {
        afpArray.push( `rad${filterParams.searchRadius}` );
      }

      return afpArray.join( ',' );
    }
  };

  //---------------------------------------
  //--- API ---
  const _public = {
    init: _private.init,
    setDisplayMode: _private.setDisplayMode
  };

  return _public;
} )();

//----- Add lang es to espanol radio button -----
setTimeout ( () => {  // TODO: why on earth are we doing this *here*?
  $('label.radio-container:contains("Espanol")').attr("lang","es");
  },
3000);

/*
^1^ Lines marked with this footnote implement a workaround for browsers which do not yet support the CSS
:has() pseudo-class. Said lines may be removed once we've determined support for :has() to be wide enough.
*/

'use strict';

window.LocatorDetail = ( () => {
  const CLICK_A11Y_EVENT = 'click:a11y';
  const ORIGIN_TEXT_ADDRESS = LocatorUtils.getParamsFromSession( LocatorUtils.SEARCH_FORM_SESSION_KEY ).textAddress?.[0];
  const CHOSEN = LocatorUtils.getParamsFromSession( LocatorUtils.RESULT_LIST_SESSION_KEY );
  let $cmp;

  const _private = {
    init: async () => {
      // Analytics:
      marTech.trackState( {
        pageName: `truist|com${window.location.pathname.replace( /\//g, '|' ).replace( /-/g, '_' )}`
      } );

      // Useful object references, etc:
      $cmp = $( '.location-detail-component' ).first();
      CHOSEN.backLinkHref && $cmp.find( 'a.back-btn' ).attr( 'href', CHOSEN.backLinkHref ).removeClass( 'hide' );

      // Location coordinates, map, schedule, etc:
      const [ LOC, LOC_ADDR ] = LocatorUtils.scrubLocationObject( $cmp.data( 'locationInfo' ), ORIGIN_TEXT_ADDRESS );
      _private.initMapAndDirectionsLink( LOC_ADDR );
      _private.initSchedules( LOC );

      // Event handling:
      $( window ).resize( _private.toggleDetailMapList );
      $cmp.find( '.details-view-component' ).on( CLICK_A11Y_EVENT, '.js-location-status', LocatorUtils.openStatusModal );
      $cmp.find( '.details-view-component' ).on( CLICK_A11Y_EVENT, '.js-location-status', function(ev) {
        window.addEventListener('keydown', _private.infoIconTabTrap);
        $(this).closest('.location-detail-component').find('.js-location-status-msg .close-icon-popup').attr( 'tabindex', 0 ).css('border', '1px solid outline').focus();
      } );
      $cmp.find( '.js-location-status-msg .close-icon-popup' ).on( CLICK_A11Y_EVENT, _private.informationIcon );

      LocatorUtils.autoScroll( $cmp );
    },

    initMapAndDirectionsLink: ( locAddr = {} ) => {
      const $GET_DIRECTION = $cmp.find( 'a.get-direction' );

      try {
        if ( !locAddr.directionsHref ) throw new Error( 'Cannot show directions without origin address.' );

        const SPEEDBUMP_URL = new URL( $GET_DIRECTION.get(0) );
        SPEEDBUMP_URL.search = window.location.search;
        SPEEDBUMP_URL.searchParams.set( 'url', locAddr.directionsHref );

        $GET_DIRECTION
          .attr( { href: SPEEDBUMP_URL.href, 'data-external-href': locAddr.directionsHref } )
          .on( CLICK_A11Y_EVENT, LocatorUtils.openGetDirectionsModal );
      }
      catch ( err ) {
        console.warn( err );
        $GET_DIRECTION.parent().addClass( 'hide' );
      }

      LocatorMap.init( {
        $container: $cmp.find( '#map' ),

        mapOptions: {
          gestureHandling: 'none',
          keyboardShortcuts: false,
          zoomControl: false
        }
      } );

      const DESTINATION = ( new truistLatLng( parseFloat( locAddr.lat ), parseFloat( locAddr['long'] ) ) ).literal();
      LocatorMap.initMarkers( DESTINATION.lat, DESTINATION.lng, { mode: 'SINGLE', title: locAddr.markerTitle } );
      LocatorMap.fitToIndex( 0 );
    },

    initSchedules: ( loc = {} ) => {
      const LTTP = LocationTimeTableParser( {
        todayScheduleTemplate:  $cmp.find( '.js-cloners >.js-location-today-container' ).html(),
        timeTableEntryTemplate: $cmp.find( '.js-cloners >.lobby-items' ).html(),
        statusLinkTemplate:     $cmp.find( '.js-cloners >a.js-location-status' ).prop( 'outerHTML' )
      } );

      LTTP.setLocation( loc );
      const $HMDC = $cmp.find( '.hours-map-details-container' );

      $HMDC.children().each( ( i, elm ) => {
        const $ME = $( elm );
        const KEY = $ME.data( 'schedKey' );
        const TODAY_SCHEDULE_MARKUP = LTTP.getTodayScheduleMarkup( KEY, 'Today' );

        TODAY_SCHEDULE_MARKUP ?
          $ME.find( '>ul' ).append( TODAY_SCHEDULE_MARKUP, LTTP.getTimeTableMarkup( KEY ) ) :
          $ME.remove();
      } );

      ( $HMDC.children().length === 0 ) && $HMDC.parent().remove();
    },

    informationIcon: function() {
      $( this ).closest( '.js-location-status-msg' ).parent().find( '.js-location-status' )
        .attr( 'tabindex', 0 )
        .css( 'border', '1px solid outline' )
        .focus();

      window.removeEventListener('keydown', _private.infoIconTabTrap);
    },

    infoIconTabTrap: function(ev) {
      ev.preventDefault();
    },

    toggleDetailMapList: function() {
      if ( $( window ).width() > 815 ) {
        $cmp.find( '.details-view-component' ).show();
        $cmp.find( '.map-view' ).show();
      }
    }
  };

  return {
    init: _private.init
  };
} )();

