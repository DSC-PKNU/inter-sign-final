const functions = require("firebase-functions");
const express = require("express");
const app = express();
const fs = require("fs");

app.set("views", __dirname + "/views");
app.set("view engine", "ejs");

app.use(express.json());
app.use(express.urlencoded({extended: true}));

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://intersign-dca94-default-rtdb.firebaseio.com",
});

app.get("/", function(request, response) {
  fs.readFile("introduction.html", function(error, data) {
    response.writeHead(200, {"Content-Type": "text/html"});
    response.end(data);
  });
});

app.get("/room_list", function(request, response) {
  fs.readFile("room_list.html", function(error, data) {
    response.writeHead(200, {"Content-Type": "text/html"});
    response.end(data);
  });
});

app.get("/new_room", function(request, response) {
  fs.readFile("room_popup.html", function(error, data) {
    response.writeHead(200, {"Content-Type": "text/html"});
    response.end(data);
  });
});

// join room
app.post("/join_exist_room", function(request, response) {
  console.log("get 방식의 join_exist_room");
  const code = request.body.code;
  let lang;
  let ppl;
  let title;

  console.log("Received code: " + code.toString());

  // db 불러오기
  const dbRef = admin.database().ref("rooms/" + code);
  dbRef.on("value", (snapshot) => {
    const data = snapshot.val();
    lang = data.language;
    ppl = data.num_of_people;
    title = data.title;

    console.log("db에서 가져온 data: " + lang + ", " + ppl + ", " + title);

    response.send(data);
  });
});

app.get("/join_room", function(request, response) {
  console.log("get 방식의 join_room");

  fs.readFile("chat_room.html", function(error, data) {
    response.writeHead(200, {"Content-Type": "text/html"});
    response.end(data);
  });
});

// create room
app.post("/join_room", function(request, response) {
  console.log("post 방식의 join_room");
  const title = request.body.title;
  if (!title) {
    title = "title";
  }
  console.log("방 제목: " + title);

  response.render("chat_room.ejs", {"title": title}, function(err, html) {
    if (err) {
      console.log(err);
    }
    response.end(html);
  });
});

app.get("/get_room_list", function(req, res) {
  const dbRef = admin.database().ref("rooms");
  dbRef.on("value", (snapshot) => {
    const data = snapshot.val();
    console.log(data);
    res.send(data);
  });
});

app.post("/save_room", function(req, res) {
  // db에 현재 방 목록 저장
  const roomCode = req.body.code;
  const title = req.body.title;
  const lang = req.body.lang;
  const people = req.body.people;
  console.log("save_room data: " +
      roomCode + ", " + title + ", " + lang + ", " + people);

  /**
  * Write room info on firebase db
  * @param {String} code The room code.
  * @param {String} title The room title.
  * @param {String} lang The language used in the room.
  * @param {number} people The number of people of the room.
  */
  function writeRoomData(code, title, lang, people) {
    admin.database().ref("rooms/" + code).set({
      title: title,
      language: lang,
      num_of_people: people,
    });
  }

  writeRoomData(roomCode, title, lang, people);

  res.end();
});

app.post("/hang_up", function(req, res) {
  const roomCode = req.body.code;
  console.log("서버 hang_up 호출: " + roomCode);
    
  const dbRef = admin.database().ref("rooms/"+roomCode);
  dbRef.remove();

  // fs.readFile("room_list.html", function(error, data) {
  //   response.writeHead(200, {"Content-Type": "text/html"});
  //   response.end(data);
  // });
  res.end();
});

// app.listen(3000, function() {
//   console.log('Example app listening on port 3000!')
// });
exports.app1 = functions.https.onRequest(app);
