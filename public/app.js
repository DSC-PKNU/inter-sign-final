const configuration = {
  iceServers: [
    {
      urls: [
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
      ],
    },
  ],
  iceCandidatePoolSize: 10,
};

let peerConnection = null;
let localStream = null;
let remoteStream = null;
let roomDialog = null;
let roomId = null;
let channel = null;
let receiveChannel;
const remoteLabelContainer = document.getElementById("remoteLabel-container");

var title = null;
var curRoomData = new Object();

var URL;

let model, webcam, labelContainer, maxPredictions, classification;
const aslList = ["Baby", "Brother", "Don't like", "Friend", "Help", "House", "Like", "Love", "Make", "More", "Name",
  "No", "Pay", "Play", "Stop", "With", "Yes"];
const kslList = ["나중에", "놀다", "뭐했어요", "반갑습니다", "부산", "오늘", "오세요", "요리", "저는", "좋아합니다", "취미"];

init();

function init() {
  console.log("localStorage exist: " + localStorage.getItem("exist"));
  if (localStorage.getItem("exist") == 'true') {
    roomId = sessionStorage.getItem("code");
    
    URL = "../ksl-model/new_model/model.json";
    classification = kslList;
    
    getExistRoom(roomId);
  } else {
    console.log("localStorage title: " + localStorage.getItem("title"));
    title = localStorage.getItem("title");
    document.title = title + " - InterSign";

    URL = "../asl-model/new_model/model.json";
    classification = aslList;

    openUserMedia();
  }

  console.log('current user\'s language', URL);

  document.querySelector('#micBtn').addEventListener('click', turnOnMic);
  document.querySelector('#hangupBtn').addEventListener('click', hangUp);
}

async function createRoom() {
  const db = firebase.firestore();
  const roomRef = await db.collection('rooms').doc();

  console.log('Create PeerConnection with configuration: ', configuration);
  peerConnection = new RTCPeerConnection(configuration);

  /* data channel */
  channel = peerConnection.createDataChannel("sub");
  channel.onopen = function(event) {
    interpret();
    
    remoteLabelContainer.appendChild(document.createElement("div"));
  }
  channel.onmessage = function(event) {
    let subtitle = document.getElementById("remoteSub");

    console.log("From remote cam:", event.data);
    subtitle.innerText = event.data;
  }

  registerPeerConnectionListeners();

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // Code for collecting ICE candidates below
  const callerCandidatesCollection = roomRef.collection('callerCandidates');

  peerConnection.addEventListener('icecandidate', event => {
    if (!event.candidate) {
      console.log('Got final candidate!');
      return;
    }
    console.log('Got candidate: ', event.candidate);
    callerCandidatesCollection.add(event.candidate.toJSON());
  });
  // Code for collecting ICE candidates above

  // Code for creating a room below
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  console.log('Created offer:', offer);

  const roomWithOffer = {
    'offer': {
      type: offer.type,
      sdp: offer.sdp,
    },
  };
  await roomRef.set(roomWithOffer);
  roomId = roomRef.id;
  // roomId 서버로 전달
  sendByPost(roomId, title, ["US", "KR"], 1);
  console.log(`New room created with SDP offer. Room ID: ${roomRef.id}`);
  document.querySelector(
      '#currentRoom').innerText = `Current room is ${roomRef.id} - You are the caller!`;
  // Code for creating a room above

  peerConnection.addEventListener('track', event => {
    console.log('Got remote track:', event.streams[0]);
    event.streams[0].getTracks().forEach(track => {
      console.log('Add a track to the remoteStream:', track);
      remoteStream.addTrack(track);
    });
  });

  // Listening for remote session description below
  roomRef.onSnapshot(async snapshot => {
    const data = snapshot.data();
    if (!peerConnection.currentRemoteDescription && data && data.answer) {
      console.log('Got remote description: ', data.answer);
      const rtcSessionDescription = new RTCSessionDescription(data.answer);
      await peerConnection.setRemoteDescription(rtcSessionDescription);
    }
  });
  // Listening for remote session description above

  // Listen for remote ICE candidates below
  roomRef.collection('calleeCandidates').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(async change => {
      if (change.type === 'added') {
        let data = change.doc.data();
        console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
        await peerConnection.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
  // Listen for remote ICE candidates above
}

async function joinRoomById(roomId) {
  const db = firebase.firestore();
  const roomRef = db.collection('rooms').doc(`${roomId}`);
  const roomSnapshot = await roomRef.get();
  console.log('Got room:', roomSnapshot.exists);

  if (roomSnapshot.exists) {
    console.log('Create PeerConnection with configuration: ', configuration);
    peerConnection = new RTCPeerConnection(configuration);
    peerConnection.ondatachannel = function(event) {
      channel = event.channel;
      channel.onopen = function(event) {
        interpret();
        // predictWebcam();
      }
      channel.onmessage = function(event) {
        let subtitle = document.getElementById("remoteSub");

        console.log("From remote cam:", event.data);
        subtitle.innerText = event.data;
      }
    }
    registerPeerConnectionListeners();
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    // Code for collecting ICE candidates below
    const calleeCandidatesCollection = roomRef.collection('calleeCandidates');
    peerConnection.addEventListener('icecandidate', event => {
      if (!event.candidate) {
        console.log('Got final candidate!');
        return;
      }
      console.log('Got candidate: ', event.candidate);
      calleeCandidatesCollection.add(event.candidate.toJSON());
    });
    // Code for collecting ICE candidates above

    peerConnection.addEventListener('track', event => {
      console.log('Got remote track:', event.streams[0]);
      event.streams[0].getTracks().forEach(track => {
        console.log('Add a track to the remoteStream:', track);
        remoteStream.addTrack(track);
      });
    });

    // Code for creating SDP answer below
    const offer = roomSnapshot.data().offer;
    console.log('Got offer:', offer);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    console.log('Created answer:', answer);
    await peerConnection.setLocalDescription(answer);

    const roomWithAnswer = {
      answer: {
        type: answer.type,
        sdp: answer.sdp,
      },
    };
    await roomRef.update(roomWithAnswer);
    // Code for creating SDP answer above

    // Listening for remote ICE candidates below
    roomRef.collection('callerCandidates').onSnapshot(snapshot => {
      snapshot.docChanges().forEach(async change => {
        if (change.type === 'added') {
          let data = change.doc.data();
          console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
          await peerConnection.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
    // Listening for remote ICE candidates above
  }
}

function turnOnMic() {
  var vid = document.getElementById("localVideo");
  var mic = document.getElementById("micBtn");
  if (vid.muted == true) {
    vid.muted = false;
    mic.src="assets/images/mic_off.png";
  } else {
    vid.muted = true;
    mic.src="assets/images/microphone_on.png";
  }
}

async function openUserMedia(e) {
  const stream = await navigator.mediaDevices.getUserMedia(
      {video: true, audio: true});
  document.querySelector('#localVideo').srcObject = stream;
  localStream = stream;
  remoteStream = new MediaStream();
  document.querySelector('#remoteVideo').srcObject = remoteStream;

  console.log('Stream:', document.querySelector('#localVideo').srcObject);
  document.querySelector('#cameraBtn').disabled = true;
  document.querySelector('#hangupBtn').disabled = false;

  createRoom();
}

async function openUserMediaAndJoin(code) {
  const stream = await navigator.mediaDevices.getUserMedia(
      {video: true, audio: true});
  document.querySelector('#localVideo').srcObject = stream;
  localStream = stream;
  remoteStream = new MediaStream();
  document.querySelector('#remoteVideo').srcObject = remoteStream;

  console.log('Stream:', document.querySelector('#localVideo').srcObject);
  document.querySelector('#cameraBtn').disabled = true;
  document.querySelector('#hangupBtn').disabled = false;

  joinRoomById(roomId);
}

async function hangUp(e) {
  const tracks = document.querySelector('#localVideo').srcObject.getTracks();
  tracks.forEach(track => {
    track.stop();
  });

  if (remoteStream) {
    remoteStream.getTracks().forEach(track => track.stop());
  }

  if (peerConnection) {
    peerConnection.close();
  }

  document.querySelector('#localVideo').srcObject = null;
  document.querySelector('#remoteVideo').srcObject = null;
  document.querySelector('#cameraBtn').disabled = false;
  document.querySelector('#hangupBtn').disabled = true;
  document.querySelector('#currentRoom').innerText = '';

  // Delete room on hangup
  if (roomId && sendHangup(roomId)) {
    const db = firebase.firestore();
    const roomRef = db.collection('rooms').doc(roomId);
    const calleeCandidates = await roomRef.collection('calleeCandidates').get();
    calleeCandidates.forEach(async candidate => {
      await candidate.ref.delete();
    });
    const callerCandidates = await roomRef.collection('callerCandidates').get();
    callerCandidates.forEach(async candidate => {
      await candidate.ref.delete();
    });
    await roomRef.delete();
  }

  window.location.href = "/room_list";
}

function registerPeerConnectionListeners() {
  peerConnection.addEventListener('icegatheringstatechange', () => {
    console.log(
        `ICE gathering state changed: ${peerConnection.iceGatheringState}`);
  });

  peerConnection.addEventListener('connectionstatechange', () => {
    console.log(`Connection state change: ${peerConnection.connectionState}`);
  });

  peerConnection.addEventListener('signalingstatechange', () => {
    console.log(`Signaling state change: ${peerConnection.signalingState}`);
  });

  peerConnection.addEventListener('iceconnectionstatechange ', () => {
    console.log(
        `ICE connection state change: ${peerConnection.iceConnectionState}`);
  });
}


/* Interpretation part */

// Load the image model and setup the webcam
async function interpret() {
  // load the model
  model = await tf.loadLayersModel("../asl-model/new_model/model.json");
  console.log();
  maxPredictions = classification.length;

  // Setup a webcam
  const flip = true;
  webcam = new tmImage.Webcam(200, 200, flip); // width, height, flip
  await webcam.setup(); // request access to the webcam
  await webcam.play();
  window.requestAnimationFrame(loop);

  // append elements to the DOM
  document.getElementById("webcam-container").appendChild(webcam.canvas);
  labelContainer = document.getElementById("label-container");
  for (let i = 0; i < maxPredictions; i++) { // and class labels
      labelContainer.appendChild(document.createElement("div"));
  }
}

async function loop() {
    webcam.update(); // update the webcam frame
    await predict();
    window.requestAnimationFrame(loop);
}

// run the webcam image through the image model
async function predict() {
    // predict can take in an image, video or canvas html element
    let tensor = tf.expandDims(tf.browser.fromPixels(webcam.canvas), axis=0)
    // console.log("tensor:", tensor);
    const prediction = await model.predict(tensor).data();
    // console.log("prediction:", prediction);
    for (let i = 0; i < maxPredictions; i++) {
      // const classPrediction = prediction[i] == 1 ? aslList[i] : ' ';
      const classPrediction = prediction[i] >= 0.66 ? classification[i] : ' ';
      labelContainer.childNodes[i].innerHTML = classPrediction;
      channel.send(classPrediction);
    }
}

function sendByPost(code, title, lang, ppl) {
  console.log("sendByPost 방 정보: " + code + ", " + title + ", " + lang + ", " + ppl);

  const url = "save_room";
  var xhr = new XMLHttpRequest();

  xhr.open('POST', url, true);
  var data = new Object();
  data.code = code;
  data.title = title;
  data.lang = lang;
  data.people = ppl;
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.send(JSON.stringify(data));
}

function sendHangup(code) {
  console.log("sendHangup 호출: " + code);

  const url = "hang_up";
  var xhr = new XMLHttpRequest();

  xhr.open('POST', url, true);
  var data = new Object();
  data.code = code;
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.send(JSON.stringify(data));

  // 현재 방의 인원수가 1인지 응답 받아야 함
  xhr.onload = (e) => {
    var res = xhr.response;
    console.log("sendHangup res: " + res);
    res = JSON.parse(res);

    if (res.num == "1") {
      return true;
    } else {
      return false;
    }
  }
}

function getExistRoom(code) {
  console.log("getExistRoom 호출: " + code);
  openUserMediaAndJoin(code);

  var data = new Object();
  data.code = code;
  const request = new XMLHttpRequest();
  const url = 'join_exist_room';
  request.open("POST", url, true);
  request.setRequestHeader("Content-Type", "application/json");
  request.send(JSON.stringify(data));

  request.onload = (e) => {
    var resData = request.response;
    resData = JSON.parse(resData);
    console.log(resData);

    console.log("resData: " + resData.language + ", " + resData.num_of_people + ", " + resData.title);
    curRoomData.lang = resData.language;
    curRoomData.people = resData.num_of_people;
    curRoomData.title = resData.title;

    console.log("json 데이터: " + curRoomData.lang + ", " + curRoomData.people + ", " + curRoomData.title);
    
    title = curRoomData.title;
    console.log("Current room title: " + title);
    document.title = title + " - InterSign";
  }
}
