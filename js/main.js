
const year = document.getElementById("year");
if (year) year.textContent = new Date().getFullYear();

const toggle = document.querySelector(".nav-toggle");
const nav = document.querySelector(".site-nav");
if (toggle && nav) {
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
}

const face = document.getElementById("honeyFace");
const state = document.getElementById("honeyState");
const message = document.getElementById("honeyMessage");

if (face && state && message) {
  const states = [
    ["( ^_^ )", "CALM", "Network is quiet."],
    ["( o_o )", "WATCHING", "Something caught my attention."],
    ["( O_o )", "CURIOUS", "Hmm... that's interesting."],
    ["( >_< )", "NERVOUS", "I'm seeing unusual activity."],
    ["( @_@ )", "LEARNING", "Studying what I observed."]
  ];
  let i = 1;
  setInterval(() => {
    const [f, s, m] = states[i % states.length];
    face.textContent = f;
    state.textContent = s;
    message.textContent = m;
    i += 1;
  }, 3500);
}
