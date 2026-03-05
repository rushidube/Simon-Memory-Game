let gameSeq = [];
let userSeq = [];

let btns = ["yellow", "green", "red", "purple"];

let started = false;
let level = 0;

let startBtn = document.getElementById("startBtn");
let restartBtn = document.getElementById("restartBtn");
let h3 = document.querySelector("h3");

let highScore = localStorage.getItem("highScore") || 0;
document.getElementById("highscore").innerText = "High Score : " + highScore;

h3.innerText = "Press Start to play the game";


function playSound(color){
    let audio = new Audio("sounds/" + color + ".mp3");
    audio.play();

    setTimeout(() =>{
        audio.pause();
        audio.currentTime = 0;
    }, 500);
}


startBtn.addEventListener("click", function() {
    if(!started){
        started = true;
        levelUp();
    }
});


restartBtn.addEventListener("click", function() {
    reset();
    document.getElementById("level").innerText = "Level : 0";
    h3.innerText = "Press Start to play";
});


function gameFlash(btn) {
    btn.classList.add("flash");
    playSound(btn.id);

    setTimeout(function () {
        btn.classList.remove("flash");
    }, 250);
}


function userFlash(btn) {
    btn.classList.add("userFlash");

    setTimeout(function () {
        btn.classList.remove("userFlash");
    }, 250);
}


function levelUp() {

    userSeq = [];
    level++;

    document.getElementById("level").innerText = "Level : " + level;

    let randIdx = Math.floor(Math.random() * btns.length);
    let randColor = btns[randIdx];
    let randBtn = document.querySelector(`.${randColor}`);

    gameSeq.push(randColor);

    gameFlash(randBtn);
}


function checkAns(idx) {

    if(userSeq[idx] === gameSeq[idx]){

        if(userSeq.length === gameSeq.length){
            setTimeout(levelUp, 1000);
        }

    } 
    else {

        let score = level - 1;

        if(score > highScore){
            highScore = score;
            localStorage.setItem("highScore", highScore);
            document.getElementById("highscore").innerText = "High Score : " + highScore;
        }

        h3.innerHTML = `Game Over! Your score was <b>${score}</b><br>
                        Highest Score : <b>${highScore}</b><br>
                        Press Start to play again`;

        document.body.style.backgroundColor = "red";

        setTimeout(function (){
            document.body.style.backgroundColor = "white";
        },150);

        reset();
    }
}


function btnPress(){

    if(!started) return;

    let btn = this;

    userFlash(btn);

    let userColor = btn.getAttribute("id");

    playSound(userColor);

    userSeq.push(userColor);

    checkAns(userSeq.length - 1);
}


let allBtns = document.querySelectorAll(".btn");

for(let btn of allBtns){
    btn.addEventListener("click", btnPress);
}


function reset(){
    started = false;
    gameSeq = [];
    userSeq = [];
    level = 0;
}