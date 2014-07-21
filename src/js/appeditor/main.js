var Generator = require('./Generator').Generator;
var AppModel = require('./models/AppModel').AppModel;
var RouteCollection = require('./collections/RouteCollection').RouteCollection;
var ThemeModel = require('./models/ThemeModel').ThemeModel;
require('./mixins/BackboneConvenience');
var KeyDispatcher = require('./template_editor/KeyDispatcher').KeyDispatcher;
var MouseDispatcher = require('./template_editor/MouseDispatcher').MouseDispatcher;

var AppRouter = require('./AppRouter').AppRouter;

if (window) {

    window.onerror = function(){
        //alert("I\'m a bug, please squash me.");
    }

    if (!appState) throw "No appstate";


    /* Initialize v1State */
    window.v1State = new Backbone.Model();
    /* Global code generator for this app. */
    window.G = new Generator(function(){ return v1State.serialize().plugins; });
    v1State = new AppModel(appState);
    v1State.set('routes', new RouteCollection(appState.routes || []));

    /* Initialize v1UIEState */
    v1UIEState = new ThemeModel(uieState);

    /* Help with debugging */
    v1State.on('error', function(message) {
        alert(message);
    });

    /* Track key/mouse events */
    g_guides = {};
    keyDispatcher = new KeyDispatcher();
    mouseDispatcher = new MouseDispatcher();


    v1 = {};
    v1 = new AppRouter();
    v1.appmain(0,0);
    // Backbone.history.start({
    //     pushState: true
    // });

    // handle all click events for routing
    $(document).on('click', 'a[rel!="external"]', function(e) {
        var href = e.currentTarget.getAttribute('href') || "";
        var appId = appId || {};
        // if internal link, navigate with router
        if (appId && href.indexOf('/app/' + appId + '/') == 0) {
            v1.navigate(href, {
                trigger: true
            });
            return false;
        }
    });

}
