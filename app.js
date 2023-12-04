const express = require("express")
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors")

//Connect DB
require("./db/connection")


// Import Files
const Users = require("./models/Users");
const Converstation = require("./models/Converstaions");
const Messages = require("./models/Messages");

const port = process.env.PORT || 8000 ;


// app Use
const app = express() ;
app.use(express.json());
app.use(express.urlencoded({extended:false}));
app.use(cors());


//Routes
app.get("/", (req,res) => {
    res.send("Welcome");
})

app.post("/api/register", async (req, res) => {
    try {
        const { fullName, email, password } = req.body;
        console.log("ullName, email, password ->",fullName, email, password );
        if (!fullName || !email || !password) {
            return res.status(400).send("Please fill all required fields");
        } else {
            const isAlreadyExist = await Users.findOne({ email });
            if (isAlreadyExist) {
                return res.status(400).send("User already exists");
            } else {
                bcryptjs.hash(password, 10, async (err, hashPassword) => {
                    if (err) {
                        return res.status(500).send("Error hashing password");
                    }
                    const newUser = new Users({ fullName, email, password: hashPassword });
                    try {
                        await newUser.save();
                        return res.status(200).send("Registered new user");
                    } catch (error) {
                        return res.status(500).send("Error saving user");
                    }
                });
            }
        }
    } catch (error) {
        return res.status(500).send("Internal server error");
    }
});


app.post("/api/login", async (req,res) => {
    try {
        const {email, password } = req.body;

        if(!email || !password ){
            res.status(400).send("Please fill all reqired fields")
        }
        else{
            const user = await Users.findOne({email});
            if(!user){
                res.status(400).send("User email or password is incoorect")
            }
            else{
                const validateUser = await bcryptjs.compare(password, user.password);
                if(!validateUser){
                    res.status(400).send("User email or password is incoorect")
                }
                else{
                    const payload = {
                        userId : user._id,
                        email : user.email
                    }
                    const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || "THIS_IS_A_JWT_SECRET_KEY";
                    jwt.sign(payload, JWT_SECRET_KEY, {expiresIn : 84600}, async(err,token) => {
                        await Users.updateOne({_id : user._id}, {
                            $set: {token}
                        })
                        user.save();
                        return res.status(200).json({user : {id : user._id,  email : user.email , fullName : user.fullName}, token : token });
                    })

                    
                }

            }
            
        }

    } catch (error) {
        console.log("error->",error);
    }
})


app.post("/api/conversations", async (req,res) => {
    try {
        const {senderId, reciverId } = req.body ;

        const newConversation = new Converstation({members : [senderId, reciverId ]});
        await newConversation.save();
        res.status(200).send("Conversation created succesfully")

    } catch (error) {
        console.log("Error ->", error);
        
    }
})


app.get("/api/conversations/:userId", async (req,res) => {
    try {
        const userId = req.params.userId;
        const conversations = await Converstation.find({members : {$in: [userId]}});

        const conversationUserData = Promise.all(conversations.map( async (converstation) => {
            const reciverId = converstation.members.find((member) => member !== userId );
            const user = reciverId?  await Users.findById(reciverId) : null
            return  {user: { reciverId : user._id, email:user?.email, fullName:user?.fullName}, conversationId : converstation._id} 

        }))
        res.status(200).json(await conversationUserData);
    } catch (error) {
        console.log("error->",error);
        
    }
})

app.post("/api/message", async (req,res) => {
    try {
        const {conversationId, senderId, message, reciverId = ""} = req.body;
        if(!senderId || !message) return res.status(400).send("Please fill all required fields");
        if(!conversationId && reciverId){
            const newConversation = new Converstation({members: [senderId, reciverId]});
            await newConversation.save();
            const newMessage = new Messages({conversationId:newConversation._id, message});
            await newMessage.save();
            return res.status(200).send("Message sent succesfuly");
        } 
        else if (!conversationId || reciverId=="" ){
            return res.status(400).send("please fill all required fields");
        }

        const newMessage = new Messages({conversationId,senderId,message});
        await newMessage.save();
        res.status(200).send("Message sent succesfuly");

    } catch (error) {
        console.log("error->",error);
        
    }
})

app.get("/api/message/:conversationId", async (req,res)=>{
    try {
        const conversationId = req.params.conversationId ;
        if(conversationId == "new") return res.status(200).json([]);
        const messages = await Messages.find({conversationId});
        const messagesUserData = Promise.all(messages.map(async(message) => {
            const user = await Users.findById(message.senderId);
            return {user : {id :user._id,email : user.email, fullName : user.fullName}, message : message.message}
        }));

        res.status(200).json(await messagesUserData)
    } catch (error) {
        
    }
})


app.get("/api/users", async (req,res)=>{
    try {
        const users = await Users.find();
        const userData = Promise.all(users.map(async(user) => {
            return {user : {email : user.email, fullName : user.fullName}, userId : user._id}
        }));
        res.status(200).json(await userData);
    } catch (error) {
        console.log("error->",error);
    }

})

app.listen(port, () => {
    console.log("listening on port " + port);
} )