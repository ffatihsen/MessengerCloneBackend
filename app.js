const express = require("express")
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors")
const io = require("socket.io")(8080,{
    cors:{
        origin:"http://localhost:3000"
    }
});

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

//Socket.io
let users = [];

io.on("connection", socket => {

    socket.on("addUser",userId => {
        const isUserExist = users.find(user => user.userId === userId);
        if(!isUserExist){
            const user = {userId, socketId: socket.id};
            users.push(user);
            io.emit("getUsers",users);
        }
    });

    socket.on("sendMessage", async ({senderId, reciverId, message, conversationId })=>{
        const reciver = users.find(user => user.userId === reciverId);
        const sender = users.find(user => user.userId === senderId);
        const user = await Users.findById(senderId);

        if(reciver){
            io.to(reciver.socketId).to(sender.socketId).emit("getMessage",{
                senderId,
                message,
                conversationId,
                reciverId,
                user: {id:user._id, fullName : user.fullName, email:user.email }
            });
        }
    });


    socket.on("disconnect", () => {
        users = users.filter(user => user.socketId !== socket.id);
        io.emit("getUsers",users);
    });

})




//Routes
app.get("/", (req,res) => {
    res.send("Welcome");
})

app.post("/api/register", async (req, res) => {
    try {
        const { fullName, email, password } = req.body;
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

        if(conversationId=="new" && reciverId){
            const newConversation = new Converstation({members: [senderId, reciverId]});
            await newConversation.save();
            const newMessage = new Messages({conversationId:newConversation._id, senderId, message});
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

        const checkMessages = async (conversationId) => {
            const messages = await Messages.find({conversationId});
            const messagesUserData = Promise.all(messages.map(async(message) => {
                const user = await Users.findById(message.senderId);

                return {user : {id :user._id,email : user.email, fullName : user.fullName}, message : message.message}
            }));

            res.status(200).json(await messagesUserData)
        }


        const conversationId = req.params.conversationId ;
        
        if(conversationId == "new"){
            const checkConversation = await Converstation.find({members:{$all:[req.query.senderId, req.query.reciverId]}});

            if(checkConversation.length > 0 ){
                checkMessages(checkConversation[0]._id);
            }
            else{
                return res.status(200).json([]);
            }
        }
        else{
            checkMessages(conversationId)
        }
        
        
        

        
    } catch (error) {
        console.log("177 de error->",error);
        
    }
})


app.get("/api/users/:userId", async (req,res)=>{
    try {
        const userId = req.params.userId;
        const users = await Users.find({_id: {$ne : userId}});
        const userData = Promise.all(users.map(async(user) => {
            return {user : {email : user.email, fullName : user.fullName, reciverId : user._id }, userId : user._id, }
        }));
        res.status(200).json(await userData);
    } catch (error) {
        console.log("error->",error);
    }

})

app.listen(port, () => {
    console.log("listening on port " + port);
} )