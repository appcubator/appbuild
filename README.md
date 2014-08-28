Appcubator
==========

Update (\today)
---------------
We want to share our vision, knowledge, and experience with the web development community, in the hopes that together we can devise a system that people would actually use for educational purposes or otherwise.

- What is Appcubator
- Design Goals
- Capabilities
- Architecture
- Hacking

Design Goals
------------

Appcubator started with the premise that web software tends to be conceptually simple,
and implementing web software should be easy.

Goal: Reduce the time from idea to working prototype.

Target Users: People who didn't already have a domain knowledge in Web development. 

Web Development should be more visual in the way it's developed.

Code should be introduced into a web app at the point where it needs to be customized.

Architecture
------------

Your app is a JSON tree of macros which expand to code.
The generated apps are powered by Node.js and MongoDB.

The JSON tree, called the app state, has the following structure:

- models - database schema, functions for backend logic, and API endpoints
- templates - html templates for pages
- routes - url + logic that runs when you serve pages. also server side db or misc apis
- css - styling code for your pages. you can use prewritten themes to get started quickly

When you interact with the visual interface, you’re implicitly adding or configuring the code generators in these sections.
When you "publish", the app state is sent to the server where your app is hosted. There the code generators in each section are fully expanded to code and stored on disk.

TODO hosting

