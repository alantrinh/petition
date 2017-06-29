# Petition

### Overview

This is an online application to allow users to register and sign a petition to support a humorous cause, in this case the banning of pineapple on pizzas. This project was completed over a week starting in the sixth week of Spiced Academy.

### Details

The pages were rendered using Handlebars templates and users were able to sign a canvas element linked to client side JavaScript/jQuery to render the drawing of signatures. User registration and authentication was done with a PostgreSQL table and "bcrypt" to hash the passwords. In order to practise joining tables, user information was separated into two tables, one for mandatory information and another for supplementary information about users. Routing was via Express Router with CSRF protection provided by the "csurf" module. Caching of data and sessions was also implemented with Redis, the NoSQL database, using the "express-session" middleware and the "redis-connect" module.
