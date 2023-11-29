const express = require("express")




//Connect DB
require("./db/connection")


// Import Files
const Users = require("./models/Users");

const port = process.env.PORT || 8000 ;


// app Use
const app = express() ;
app.use(express.json());
app.use(express.urlencoded({extended:false}));


//Routes
app.get("/", (req,res) => {
    res.send("Welcome");
})


app.listen(port, () => {
    console.log("listening on port " + port);
} )