var AppModel = require("./models/AppModel");
var WidgetView = require("./template_editor/WidgetView");
var SectionsManagerView = require("./template_editor/SectionsManagerView").SectionsManagerView;
var MarqueeView = require('./template_editor/MarqueeView').MarqueeView;
var KeyDispatcher = require("./template_editor/KeyDispatcher").KeyDispatcher;
var MouseDispatcher = require("./template_editor/MouseDispatcher").MouseDispatcher;


v1State = top.v1State;
v1 = top.v1;
g_guides = top.g_guides;
uieState = top.uieState;
appId = top.appId;

keyDispatcher = top.keyDispatcher;
mouseDispatcher = top.mouseDispatcher;
statics = top.statics;
g_marqueeView = {};

var proxy = {
    setupSectionsManager: function (sectionsCollection) {
        this.sectionsManager = new SectionsManagerView(sectionsCollection);
        return this.sectionsManager;
    },

    setupMarqueeView: function (widgetsCollection) {
        this.marqueeView = new MarqueeView(widgetsCollection);
        this.marqueeView.render();
        g_marqueeView = this.marqueeView;

        document.body.appendChild(this.marqueeView.el);
        return this.marqueeView;
    },

    reArrangeCSSTag: function () {

        uieState = top.uieState;

        var style = document.getElementById("css-uiestate");
        var head = document.getElementsByTagName('head')[0];
        var newstyle = null;
        if (style) {
            newstyle = style.cloneNode(true);

        } else {
            newstyle = document.createElement("link");
            newstyle.setAttribute("rel", "stylesheet");
            newstyle.setAttribute("type", "text/css");
            newstyle.setAttribute("href", '/temp.css');
            newstyle.id = "css-uiestate";
        }

        try {
            var is_firefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;

            if (is_firefox) {
                newStyle = document.createElement('style');
                newStyle.type = 'text/css';
                newStyle.setAttribute('href', "");
                newStyle.id = "css-uiestate";
                newStyle.setAttribute('rel', 'stylesheet');

            } else {
                head.appendChild(newstyle);
                newstyle.onload = function () {
                    $('.tempStyle').remove();
                    if (style && style.parentNode) style.parentNode.removeChild(style);
                };
            }

        } catch (e) {

        }
    },

    addTempStyleSheet: function (url, callback) {

        uieState = top.uieState;
        var templStyles = $('.tempStyle');
        var style = document.getElementById("css-uiestate");
        var head = document.getElementsByTagName('head')[0];
        var newstyle = document.createElement("link");
        newstyle.setAttribute("rel", "stylesheet");
        newstyle.setAttribute("type", "text/css");
        newstyle.setAttribute("href", url);
        newstyle.className = "tempStyle";

        var is_firefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;

        if (is_firefox) {
            newStyle = document.createElement('style');
            newStyle.type = 'text/css';
            newStyle.setAttribute('href', "");
            newStyle.id = "css-uiestate";
            newStyle.setAttribute('rel', 'stylesheet');
            // $.ajax({
            //     type: "GET",
            //     url: '/app/' + appId + '/uiestate.css',
            //     statusCode: {
            //         200: function(data) {
            //             $(style).attr('href', '');
            //             $(style).text(data.responseText);
            //         }
            //     },
            //     dataType: "JSON"
            // });

        } else {
            head.appendChild(newstyle);
            newstyle.onload = function () {
                //newstyle.setAttribute('href', "/app/"+appId+"/uiestate.css");
                templStyles.remove();
                if (style) {
                    try {
                        style.parentNode.removeChild(style);
                    } catch (e) {

                    }
                }
                if (callback) callback.call(this);
            };
        }
    },

    removeTempStyleSheet: function () {
        this.reArrangeCSSTag();
    },

    updateScrollbar: function () {
        $(document.body).niceScroll();
    },

    reloadPage: function () {
        location.reload();
    },

    injectHeader: function (headerContent) {
        $('head').append(headerContent);
    }
};

$(window).on('mouseup', function () {
    top.v1.shrinkDropdowns();
});

$(document).ready(function () {
    util.askBeforeLeave();
})

console.log(top.v1);
console.log(top.v1.currentApp);
if (top.v1.currentApp) {
    top.v1.currentApp.renderIFrameContent(proxy);
}
