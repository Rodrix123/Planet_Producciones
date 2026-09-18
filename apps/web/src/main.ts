import "./style.css";

const app = document.querySelector<HTMLElement>("#app");

if (!app) throw new Error("Missing #app element");

app.innerHTML = `
  <section class="shell">
    <p class="eyebrow">Better Fullstack</p>
    <h1>my-app</h1>
    <p>A framework-free Vite + TypeScript starter, ready for your stack.</p>
    <a href="https://better-fullstack.dev" target="_blank" rel="noreferrer">Explore the docs</a>
  </section>
`;
