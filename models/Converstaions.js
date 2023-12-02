const mongoose = require("mongoose");


const converstationSchema = mongoose.Schema({
    members : {
        type : Array,
        required : true,
    }
});


const Converstation = mongoose.model("Converstation", converstationSchema);


module.exports = Converstation ;