const express = require('express'),
    router = express.Router();
const spicedPg = require('spiced-pg');
let db = spicedPg(process.env.DATABASE_URL || require("./../config/postgres_login.json").dbURL);
const server = require("./../server.js");

const csurf = require('csurf');
const csrfProtection = csurf({cookie: true});

module.exports = router;

var redis = require("redis");
var client = redis.createClient(process.env.REDIS_URL || {
    host: "localhost",
    port: 6379
});

client.on("error", function(err) {
    console.log(err);
});

//ROUTES
router.route("/login")

    .get(csrfProtection, (req, res) => { //get login page
        if (req.session.user) {
            res.redirect("/petition");
        } else {
            res.render("login", { //display below relevant error on login screen when redirected here
                layout: "main",
                emailerror: req.query.emailerror,
                email: req.query.email,
                passworderror: req.query.passworderror,
                disable_login: req.query.disable_login,
                csrfToken: req.csrfToken()
            });
        }
    })

    .post(csrfProtection, (req, res) => { //submit login data
        client.exists("disable_login", (err, reply) => {
            if (err) {
                return console.log(err);
            } else if (reply == 1) {
                client.setex("disable_login", 30, true, (err) => { //disable login for 30 seconds again if disable_login object still exists in Redis
                    if (err) {
                        return console.log(err);
                    } else {
                        res.redirect(`/login?disable_login=1`);
                    }
                });
            } else {
                db.query(`SELECT id, first_name, last_Name, password_hash FROM users WHERE email_address = $1;`, [req.body["email-address"]]).then((results) => {
                    if (results.rows[0] == undefined) {
                        res.redirect(`/login?emailerror=1&email=${req.body["email-address"]}`);
                    } else {
                        server.checkPassword(req.body.password, results.rows[0]["password_hash"]).then((matches) => {
                            if (matches) {
                                console.log("correct password");
                                client.del("failed_tries", (err) => { //delete failed_tries from Redis
                                    if (err) {
                                        return console.log(err);
                                    }
                                });
                                req.session.user = results.rows[0];
                                db.query(`SELECT id FROM signees WHERE user_id = $1;`, [req.session.user.id]).then((sigResults) => {
                                    if (sigResults.rows[0] == undefined) { //if signature does not exist redirect to petition page
                                        res.redirect("/petition");
                                    } else {//if signature exists, redirect to thank you page
                                        req.session.user.signatureId = sigResults.rows[0].id;
                                        res.redirect("/thanks");
                                    }
                                }).catch((err) => {
                                    console.log(err);
                                });
                            } else {
                                console.log("wrong password");
                                client.exists("failed_tries", (err, reply) => { //if failed_tries object exists in Redis
                                    if (reply == 1) {
                                        client.incr("failed_tries", (err, data) => { //increment failed_tries object
                                            if (err) {
                                                return console.log(err);
                                            } else if (data == 3) {
                                                client.setex("disable_login", 30, true, (err) => { //if there are three failed tries, set disable_login object for 30 seconds
                                                    if (err) {
                                                        return console.log(err);
                                                    } else {
                                                        client.del("failed_tries", (err) => { //reset failed_tries object after setting disable_login
                                                            if (err) {
                                                                return console.log(err);
                                                            } else {
                                                                res.redirect(`/login?passworderror=1&disable_login=1`);
                                                            }
                                                        });
                                                    }
                                                });
                                            } else {
                                                res.redirect(`/login?passworderror=1`);
                                            }
                                        });
                                    } else {
                                        client.set("failed_tries", 1, (err) => {//set failed_tries object if this is the first wrong password
                                            if (err) {
                                                return console.log(err);
                                            } else {
                                                res.redirect(`/login?passworderror=1`);
                                            }
                                        });
                                    }
                                });
                            }
                        }).catch((err) => {
                            console.log(err);
                            res.redirect("/login");
                        });
                    }
                }).catch((err) => {
                    console.log(err);
                    res.redirect("/login");
                });
            }
        });
    });

router.route("/register")

    .get(csrfProtection, (req, res) => {  //get register page
        if (req.session.user) {
            res.redirect("/petition");
        } else {
            res.render("register", {
                layout:"main",
                csrfToken: req.csrfToken()
            });
        }
    })

    .post(csrfProtection, (req, res) => { //submit registration details
        server.recordExists("*", "users", "email_address = $1", [req.body["email-address"]]).then((emailExists) => {
            if (emailExists) {
                res.render("register", {
                    layout: "main",
                    "email-exists": true,
                    csrfToken: req.csrfToken()
                });
            } else {
                server.hashPassword(req.body.password).then((hash) => {
                    db.query(`INSERT INTO users (first_name, last_name, email_address, password_hash, registration_date_time) VALUES ($1, $2, $3, $4, \'${new Date().toISOString().slice(0, 19).replace('T', ' ')}\') RETURNING id, first_name, last_name;`, [req.body["first-name"], req.body["last-name"], req.body["email-address"], hash]).then((results) => {
                        req.session.user = results.rows[0];
                        console.log(req.session.user);
                        res.redirect("/profile"); //redirect to profile page on successful registration
                    }).catch((err) => {
                        console.log(err);
                        res.redirect("/register"); //redirect to register page on failed registration
                    });
                }).catch((err) => {
                    console.log(err);
                    res.redirect("/register");
                });
            }
        });
    });

router.route("/profile")

    .get(csrfProtection, (req, res) => { //display initial profile page
        if (!req.session.user) {
            res.redirect("/login");
        } else {
            server.recordExists("id", "users", "id = $1", [req.session.user.id]).then((userExists) => {
                if (userExists) {
                    server.recordExists("user_id", "user_profiles", "user_id = $1", [req.session.user.id]).then((profileExists) => {
                        if (profileExists) {
                            res.redirect("/profile/edit");
                        } else {
                            res.render("profile", {
                                layout: "main",
                                logged_in: true,
                                has_signed: req.session.user.signatureId,
                                csrfToken: req.csrfToken()
                            });
                        }
                    });
                } else {
                    req.session.user = null;
                    res.redirect("/login");
                }
            });
        }
    })

    .post(csrfProtection, (req, res) => { //submit profile changes
        if (req.body.age == "") {
            req.body.age = null;
        }
        db.query(`INSERT INTO user_profiles(user_id, age, city, url) VALUES ($1, $2, $3, $4);`, [req.session.user.id, req.body.age, req.body.city, req.body.url]).then(() => {
            client.del("signees", (err) => { //delete data in Redis cache on change of profile
                if (err) {
                    console.log(err);
                }
            });
            res.redirect("/petition");
        }).catch((err) => {
            console.log(err);
        });
    });

router.route("/profile/edit")

    .get(csrfProtection, (req, res) => { //display profile edit page
        if (!req.session.user) {
            res.redirect("/login");
        } else {
            server.recordExists("id", "users", "id = $1", [req.session.user.id]).then((userExists) => {
                if (userExists) {
                    db.query(`SELECT * FROM users JOIN user_profiles ON users.id = user_profiles.user_id WHERE users.id = $1;`, [req.session.user.id]).then((results) => {
                        res.render("edit", { //populate profile edit page with user data
                            layout: "main",
                            logged_in: true,
                            has_signed: req.session.user.signatureId,
                            timestamp: results.rows[0]["registration_date_time"],
                            first_name: results.rows[0]["first_name"],
                            last_name: results.rows[0]["last_name"],
                            email_address: results.rows[0]["email_address"],
                            age: results.rows[0].age,
                            city: results.rows[0].city,
                            url: results.rows[0].url,
                            email_exists: req.query.email_exists,
                            csrfToken: req.csrfToken()
                        });
                    });
                } else {
                    req.session.user = null;
                    res.redirect("/login");
                }
            });
        }
    })

    .post(csrfProtection, (req, res) => { //submit profile changes
        server.recordExists("*", "users", "email_address = $1 AND NOT id = $2", [req.body["email-address"], req.session.user.id]).then((emailExists) => { //check if changed email already exists
            if (emailExists) { //redirect if updated email already exists
                res.redirect("/profile/edit/?email_exists=1");
            } else {
                if (req.body.password != "") { //update password if changed
                    server.hashPassword(req.body.password).then((hash) => {
                        db.query(`UPDATE users SET password_hash = '${hash}' WHERE id = $1;`, [req.session.user.id]).then(() => {
                        }).catch((err) => {
                            console.log(err);
                        });
                    }).catch((err) => {
                        console.log(err);
                    });
                }
                db.query(`UPDATE users SET first_name = $1, last_name = $2, email_address = $3 WHERE id = $4;`, [req.body["first-name"], req.body["last-name"], req.body["email-address"], req.session.user.id]).then(() => { //update users table with new data
                    client.del("signees", (err) => { //delete data in Redis cache on change of profile
                        if (err) {
                            console.log(err);
                        }
                    });
                    console.log("UPDATE of users successful");
                }).catch((err) => {
                    console.log("UPDATE of users failed");
                    console.log(err);
                });

                server.recordExists("user_id", "user_profiles", "user_id = $1", [req.session.user.id]).then((profileExists) => { //check if user submitted supplementary profile data
                    if (profileExists) { //if supplementary profile data already submitted update
                        db.query('UPDATE user_profiles SET age = $1, city = $2, url = $3 WHERE user_id = $4;', [req.body.age, req.body.city, req.body.url, req.session.user.id]).then(() => {
                            client.del("signees", (err) => { //delete data in Redis cache on change of profile
                                if (err) {
                                    console.log(err);
                                }
                            });
                            console.log("UPDATE of user_profiles successful");
                            res.redirect("/profile/edit");
                        }).catch((err) => {
                            console.log("UPDATE of user_profiles failed");
                            console.log(err);
                        });
                    } else { //if supplementary profile data not yet submitted, insert into the database
                        db.query('INSERT INTO user_profiles (age, city, url) VALUES ($1, $2, $3) WHERE user_id = $4;', [req.body.age, req.body.city, req.body.url, req.session.user.id]).then(() => {
                            client.del("signees", (err) => { //delete data in Redis cache on change of profile
                                if (err) {
                                    console.log(err);
                                }
                            });
                            res.redirect("/profile/edit");
                        }).catch((err) => {
                            console.log(err);
                        });
                    }
                });
            }
        });
    });

router.route("/delete-signature") //delete submitted signature

    .get( (req, res) => {
        if (!req.session.user) { // if session expired take to login page
            res.redirect("/login");
        } else if (!req.session.user.signatureId) {
            res.redirect("/petition"); //redirect to petition page if no signatureId exists in the session cookie
        } else {
            server.recordExists("id", "users", "id = $1", [req.session.user.id]).then((userExists) => { //check user exists in session cookie
                if (userExists) {
                    server.recordExists("id", "signees", "id = $1", [req.session.user.signatureId]).then((hasSigned) => { //check signature id in session cookie exists
                        if (hasSigned) {
                            db.query(`DELETE FROM signees WHERE id = $1`, [req.session.user.signatureId]).then(() => { //delete signature
                                console.log("signature successfully deleted");
                                client.del("signees", (err) => { //delete data in Redis cache on change of signees
                                    if (err) {
                                        console.log(err);
                                    }
                                });
                                req.session.user.signatureId = null;
                                res.redirect("/petition");
                            });
                        } else {
                            req.session.user.signatureId = null;
                            res.redirect("/petition");
                        }
                    });
                } else {
                    req.session.user = null;
                    res.redirect("/login");
                }
            });
        }
    });

router.route("/petition")

    .get(csrfProtection, (req, res) => { //render petition page
        if (!req.session.user) {
            res.redirect("/login");
        } else {
            server.recordExists("id", "users", "id = $1", [req.session.user.id]).then((userExists) => {
                if (userExists) {
                    server.recordExists("id", "signees", "id = $1", [req.session.user.signatureId]).then((hasSigned) => {
                        if (hasSigned) {
                            res.redirect("/thanks");
                        } else {
                            req.session.user.signatureId = null;
                            res.render("petition", {
                                layout: "main",
                                logged_in: true,
                                has_signed: false,
                                csrfToken: req.csrfToken()
                            });
                        }
                    });
                } else {
                    res.render("petition", {
                        layout: "main",
                        logged_in: true,
                        has_signed: false,
                        csrfToken: req.csrfToken()
                    });
                }
            });
        }
    })

    .post(csrfProtection, (req, res) => { //submit signature to petition
        db.query("INSERT INTO signees (user_id, signature) VALUES ($1, $2) RETURNING id;", [req.session.user.id, req.body.signature]).then((results) => {
            req.session.user.signatureId = results.rows[0].id;
            client.del("signees", (err) => { ////delete data in Redis cache on change of signees
                if (err) {
                    console.log(err);
                }
            });
            res.redirect("/thanks");
        }).catch((err) => {
            console.log(err);
            res.redirect("/petition");
        });
    });

router.get("/thanks", (req, res) => { //render thank you page
    if (!req.session.user || !req.session.user.signatureId) {
        res.redirect("/petition");
    } else {
        db.query(`SELECT signature FROM signees WHERE id = ${req.session.user.signatureId};`).then((results) => {
            if (results.rows[0]) {
                res.render("thanks", {
                    layout: "main",
                    logged_in: true,
                    has_signed: true,
                    signature: results.rows[0].signature
                });
            } else {
                req.session.user.signatureId = null;
                res.redirect("/petition");
            }
        }).catch((err) => {
            console.log(err);
        });
    }
});

router.get("/signees", (req, res) => { //retrieve all signees and render signee page
    if (!req.session.user || !req.session.user.signatureId) {
        res.redirect("/petition");
    } else {
        server.recordExists("id", "signees", "id = $1", [req.session.user.signatureId]).then((hasSigned) => {
            if (hasSigned) {
                client.exists("signees", (err, reply) => {
                    if (reply === 1) { //if signees object exists in Redis cache
                        client.get("signees", (err, data) => {
                            if (err) {
                                return console.log(err);
                            } else {
                                res.render("signees", {
                                    layout: "main",
                                    logged_in: true,
                                    has_signed: true,
                                    signees: JSON.parse(data)
                                });
                            }
                        });
                    } else { //if signees object does not exists in Redis cache
                        db.query(`SELECT users.first_name, users.last_name, user_profiles.age, user_profiles.city, user_profiles.url FROM users JOIN signees ON users.id = signees.user_id JOIN user_profiles on users.id = user_profiles.user_id;`).then((results) => {
                            res.render("signees", {
                                layout: "main",
                                logged_in: true,
                                has_signed: true,
                                signees: results.rows
                            });
                            client.set("signees", JSON.stringify(results.rows), (err) => { //create signees object in Redis cache
                                if (err) {
                                    return console.log(err);
                                }
                            });
                        }).catch((err) => {
                            console.log(err);
                            res.redirect("/thanks");
                        });
                    }
                });
            } else {
                req.session.user.signatureId = null;
                res.redirect("/petition");
            }
        });
    }
});

router.get("/signees/:city", (req, res) => { //render signees by city page
    if (!req.session.user || !req.session.user.signatureId) {
        res.redirect("/petition");
    } else {
        server.recordExists("id", "signees", "id = $1", [req.session.user.signatureId]).then((hasSigned) => {
            if (hasSigned) {
                db.query(`SELECT users.first_name, users.last_name, user_profiles.age, user_profiles.url FROM users JOIN signees ON users.id = signees.user_id JOIN user_profiles on users.id = user_profiles.user_id WHERE city = $1;`, [req.params.city]).then((results) => {
                    res.render("signees", {
                        layout: "main",
                        logged_in: true,
                        has_signed: true,
                        signees: results.rows
                    });
                }).catch((err) => {
                    console.log(err);
                    res.redirect("/thanks");
                });
            } else {
                req.session.user.signatureId = null;
                res.redirect("/petition");
            }
        });
    }
});

router.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.log(err);
        }
    });
    res.redirect("/login");
});

router.get("*", (req, res) => {
    res.redirect("/petition");
});
