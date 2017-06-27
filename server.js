const spicedPg = require('spiced-pg');
const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const hb = require("express-handlebars");
const fs = require("fs");
const bcrypt = require('bcryptjs');
var session = require('express-session');
var Store = require('connect-redis')(session);

module.exports.checkPassword = checkPassword;
module.exports.hashPassword = hashPassword;
module.exports.recordExists = recordExists;

app.engine("handlebars", hb());
app.set("view engine", "handlebars");

app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(cookieParser());

let db = spicedPg(process.env.DATABASE_URL || require("./config/postgres_login.json").dbURL);
let tableSql = fs.readFileSync(__dirname + "/config/petition.sql").toString();

// db.query(tableSql).then(() => { //initialise database
//     console.log("created table");
// }).catch((err) => {
//     console.log(err);
// });

function hashPassword(plainTextPassword) {
    return new Promise(function(resolve, reject) {
        bcrypt.genSalt(function(err, salt) {
            if (err) {
                reject(err);
            }
            console.log(salt);
            bcrypt.hash(plainTextPassword, salt, function(err, hash) {
                if (err) {
                    reject(err);
                }
                console.log(hash);
                resolve(hash);
            });
        });
    });
}

function checkPassword(enteredPassword, hashedPasswordFromDatabase) {
    return new Promise(function(resolve, reject) {
        bcrypt.compare(enteredPassword, hashedPasswordFromDatabase, function(err, doesMatch) {
            if (err) {
                reject(err);
            }
            resolve(doesMatch);
        });
    });
}

function recordExists(column, table, condition, userInput){
    return db.query(`SELECT ${column} FROM ${table} WHERE ${condition};`, userInput).then((results) => {
        if (results.rows[0]) {
            return true;
        } else {
            return false;
        }
    }).catch((err) => {
        console.log(err);
    });
}

//MIDDLEWARE

app.use(session({
    store: new Store({
        ttl: 3600,
        url: process.env.REDIS_URL,
        // host: "localhost",
        // port: 6379
    }),
    resave: false,
    saveUninitialized: true,
    secret: "my super fun secret"
}));

app.use(express.static(`${__dirname}/public`));

const router = require('./routes/router'); //put router after everything it needs in server file
app.use('/', router);

// error handler
app.use(function (err, req, res, next) {
    if (err.code !== 'EBADCSRFTOKEN') {
        return next(err);
    }
    // handle CSRF token errors here
    res.status(403);
    res.send('Form tampered with');
});

app.listen(process.env.PORT || 8080, () => {
    console.log("listening");
});
