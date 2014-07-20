var Generator = require('./Generator');
var AppModel = require('./models/AppModel');

if (window) {

    window.onerror = function(){
        alert('I\'m a bug, please squash me.')
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

    routeLogger = new RouteLogger({
        router: v1
    });

    // on appstate saves, synchronize version ids

    Backbone.history.start({
        pushState: true
    });

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
