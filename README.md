Appcubator
==========

Appcubator is a web-based tool for rapidly building web applications.

It has an in-browser user interface for building the app, and generates a Express.js/MongoDB app based on user input.

Design Goals
------------

1. Simple things should be simple: Easy to build a canonical web app.
2. Complex things should be possible: Allow extensibility with custom code
3. Interoperate with existing community code
4. Usable by people who don't have knowledge of web dev.

Overview
--------

1. An Appcubator app is represented as a javascript object in the browser, called the App State. It has a hierarchical structure with a well-defined schema.
2. The user creates and modifies App Components via the User Interface in order to build their app. These interactions correspond to data changes in nodes of the Javascript object.
3. When the user presses Publish, the javascript object is serialized to JSON, and shipped to a server.
4. The nodes of the javascript object go through macro-expansion to turn the user-inputted data into code.
5. The the code is written to disk, zipped, and shipped back to the user, or pushed to a server to be deployed.

More Details
------------

(these will be links)

1. mapping from the app state to the generated Node.js app
2. generator system
3. base app components built using generators
4. plugin system
5. user interface design and code
6. deployment
