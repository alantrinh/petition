# Petition

### Overview

This is an online application to allow users to register and sign a petition to support a funny cause, in this case the banning of pineapple on pizzas. This project was completed over a week starting in the sixth week of Spiced Academy.

### Details

The pages were rendered using Handlebars templates and users were able to sign via a canvas element with client side Javascript/jQuery allowing the drawing of signatures. User registration and authentication was done with a Postgres table and "bcrypt" to hash the passwords. In order to practise joining tables, user information were separated into two tables, one for mandatory information and another for supplementary information on users. Routing was via Express Router with CSRF protection by the "csurf" module. Caching was also implemented with Redis, the NoSQL database, using the "express-session" middleware and the "redis-connect" module.

The application is available on Heroku here: https://pineapple-pizza-petition.herokuapp.com/