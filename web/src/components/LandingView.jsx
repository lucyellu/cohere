import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const CAROUSEL_CARDS = [
  { id: 1, rot: -9, depth: 14, src: '/assets/images/ariana.jpg', alt: 'Ariana Grande' },
  { id: 2, rot: -5, depth: 10, src: '/assets/images/bobdylan.jpg', alt: 'Bob Dylan' },
  { id: 3, rot: -2, depth: 8,  src: '/assets/images/harrystyles.jpg', alt: 'Harry Styles' },
  { id: 4, rot: 3,  depth: 12, src: '/assets/images/joji.jpg', alt: 'Joji' },
  { id: 5, rot: 0,  depth: 6,  src: '/assets/images/posty.jpg', alt: 'Post Malone' },
  { id: 6, rot: 4,  depth: 11, src: '/assets/images/weeknd.jpg', alt: 'The Weeknd' },
  { id: 7, rot: 7,  depth: 9,  src: '/assets/images/FASHION_MeghanTrainor_MAIN.jpg', alt: 'Meghan Trainor' },
  { id: 8, rot: -4, depth: 13, src: '/assets/images/ariana2.jpg', alt: 'Ariana 2' },
];

const TEAM_CARDS = [
  { name: 'Ariana Grande', role: 'Pop Icon', src: '/assets/images/ariana.jpg' },
  { name: 'Harry Styles', role: 'Global Superstar', src: '/assets/images/harrystyles.jpg' },
  { name: 'Post Malone', role: 'Chart Topper', src: '/assets/images/posty.jpg' },
  { name: 'The Weeknd', role: 'R&B Legend', src: '/assets/images/weeknd.jpg' },
  { name: 'Joji', role: 'Alternative R&B', src: '/assets/images/joji2.jpg' },
  { name: 'Bob Dylan', role: 'Folk Legend', src: '/assets/images/bobdylan.jpg' },
  { name: 'Meghan Trainor', role: 'Pop Star', src: '/assets/images/FASHION_MeghanTrainor_MAIN.jpg' },
  { name: 'Post Malone Live', role: 'Live Performance', src: '/assets/images/Post_Malone_July_2021_(cropped).jpg' },
];

export default function LandingView({ onNavigate }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // 1. Initial States
      gsap.set('.landing-small-team .word > span', { y: '105%' });
      gsap.set('.landing-big-results .letter', { y: 80, opacity: 0 });
      gsap.set('#landingSubline', { opacity: 0, y: 20 });
      gsap.set('.landing-t-card', { opacity: 0 });
      gsap.set('.landing-stats-inner', { opacity: 0 });

      // Cards setup
      document.querySelectorAll('.landing-card').forEach((card) => {
        const rot = parseFloat(card.dataset.rot) || 0;
        card.dataset.restRot = String(rot);
        gsap.set(card, { y: -800, rotation: rot + 25, opacity: 0, scale: 0.7 });
      });

      // 2. Intro Timeline
      const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
      intro
        .to(
          '.landing-small-team .word > span',
          { y: '0%', duration: 0.9, stagger: 0.08, ease: 'power3.out' },
          0.1
        )
        .to(
          '.landing-big-results .letter',
          { y: 0, opacity: 1, duration: 0.9, stagger: 0.04, ease: 'back.out(1.6)' },
          0.35
        )
        .to(
          '.landing-card',
          {
            y: 0,
            opacity: 1,
            scale: 1,
            rotation: (i, el) => parseFloat(el.dataset.restRot) || 0,
            duration: 1.1,
            stagger: { each: 0.08, from: 'center' },
            ease: 'back.out(1.4)',
          },
          0.55
        )
        .to('#landingSubline', { opacity: 1, y: 0, duration: 0.8 }, 1.3);

      // 3. Continuous Float
      document.querySelectorAll('.landing-card').forEach((card, i) => {
        const rot = parseFloat(card.dataset.restRot) || 0;
        gsap.to(card, {
          y: `+=${8 + (i % 3) * 5}`,
          rotation: rot + (i % 2 === 0 ? 1.5 : -1.5),
          duration: 3 + (i % 4) * 0.5,
          delay: 1.5 + i * 0.1,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        });
      });

      // 4. Mouse Parallax
      const hero = document.querySelector('.landing-hero');
      let mx = 0, my = 0, tx = 0, ty = 0;
      let animId;

      const onMouseMove = (e) => {
        if (!hero) return;
        const r = hero.getBoundingClientRect();
        mx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        my = ((e.clientY - r.top) / r.height - 0.5) * 2;
      };

      const onMouseLeave = () => { mx = 0; my = 0; };

      if (hero) {
        hero.addEventListener('mousemove', onMouseMove);
        hero.addEventListener('mouseleave', onMouseLeave);
      }

      function parallaxLoop() {
        tx += (mx - tx) * 0.05;
        ty += (my - ty) * 0.05;
        document.querySelectorAll('.landing-card').forEach((card) => {
          const d = parseFloat(card.dataset.depth) || 8;
          card.style.translate = `${tx * d}px ${ty * d * 0.5}px`;
        });
        animId = requestAnimationFrame(parallaxLoop);
      }
      parallaxLoop();

      // 5. ScrollTrigger: Cards Fan Out & Big Results Scale
      const moves = [
        { x: -260, y: -40, rot: -25 },
        { x: -200, y: 20, rot: -18 },
        { x: -120, y: 80, rot: -10 },
        { x: -40, y: 120, rot: -4 },
        { x: 40, y: 120, rot: 4 },
        { x: 120, y: 80, rot: 12 },
        { x: 200, y: 20, rot: 22 },
        { x: 260, y: -40, rot: 28 },
      ];

      ScrollTrigger.create({
        trigger: '.landing-hero',
        start: 'top top',
        end: 'bottom top',
        scrub: 0.8,
        onUpdate: (self) => {
          const p = self.progress;
          const isSmall = window.innerWidth < 768;
          const scaleFactor = isSmall ? 0.4 : 1;
          gsap.set('.landing-big-results', { scale: 1 + (isSmall ? 0.08 : 0.15) * p, opacity: 1 - 0.4 * p });
          gsap.set('.landing-small-team', { y: -60 * p, opacity: 1 - p * 1.5 });
          document.querySelectorAll('.landing-card').forEach((card, i) => {
            const m = moves[i] || { x: 0, y: 0, rot: 0 };
            const rest = parseFloat(card.dataset.restRot) || 0;
            gsap.set(card, {
              x: m.x * p * scaleFactor,
              y: m.y * p * scaleFactor,
              rotation: rest + m.rot * p * (isSmall ? 0.6 : 1),
            });
          });
          gsap.set('#landingSubline', { opacity: 1 - p * 2 });
        },
      });

      // 6. Reveal Sections on Scroll
      gsap.from('.landing-team-head-text', {
        opacity: 0,
        y: 30,
        duration: 0.9,
        stagger: 0.1,
        ease: 'power3.out',
        scrollTrigger: { trigger: '.landing-team-head', start: 'top 80%' },
      });

      gsap.to('.landing-t-card', {
        opacity: 1,
        y: 0,
        duration: 1,
        stagger: 0.08,
        ease: 'power3.out',
        scrollTrigger: { trigger: '.landing-team-grid', start: 'top 80%' },
      });

      gsap.to('.landing-stats-inner', {
        opacity: 1,
        y: 0,
        duration: 1.2,
        ease: 'power3.out',
        scrollTrigger: { trigger: '.landing-stats', start: 'top 80%' },
      });

      // 7. Stat Counters
      ScrollTrigger.create({
        trigger: '.landing-stats',
        start: 'top 75%',
        onEnter: () => {
          document.querySelectorAll('.landing-stat-block .num').forEach((el) => {
            const target = parseFloat(el.dataset.count);
            const span = el.querySelector('span');
            if (!span || isNaN(target)) return;
            gsap.to(
              { v: 0 },
              {
                v: target,
                duration: 2,
                ease: 'power2.out',
                onUpdate: function () {
                  span.textContent = Math.floor(this.targets()[0].v).toLocaleString();
                },
              }
            );
          });
        },
        once: true,
      });

      return () => {
        if (hero) {
          hero.removeEventListener('mousemove', onMouseMove);
          hero.removeEventListener('mouseleave', onMouseLeave);
        }
        if (animId) cancelAnimationFrame(animId);
      };
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="w-full select-none text-[var(--ink)] overflow-x-hidden font-sans">
      {/* ============ HERO ============ */}
      <section className="landing-hero relative min-h-[90vh] flex flex-col items-center justify-center pt-24 pb-16 px-4">
        <h1 className="landing-small-team font-bold text-center leading-none tracking-tight z-10 relative mb-0 text-[clamp(40px,6.4vw,88px)] text-[var(--ink)]">
          <span className="word inline-block overflow-hidden align-top"><span className="inline-block">Discover</span></span>&nbsp;
          <span className="word inline-block overflow-hidden align-top"><span className="inline-block">concerts.</span></span>
        </h1>

        <div className="landing-big-results-wrap relative w-full -mt-4 flex justify-center z-[1] cursor-pointer">
          <div className="landing-big-results font-extrabold italic text-center whitespace-nowrap leading-[0.85] tracking-tighter text-[clamp(40px,10vw,150px)] text-[var(--ghost)] select-none drop-shadow-sm">
            {'collect memories.'.split('').map((char, i) => (
              <span key={i} className="letter inline-block origin-bottom transition-transform duration-200">
                {char === ' ' ? '\u00A0' : char}
              </span>
            ))}
          </div>
        </div>

        {/* Carousel / Floating Cards Row */}
        <div className="landing-cards-row absolute left-0 right-0 top-1/2 h-80 z-[3] pointer-events-none">
          {CAROUSEL_CARDS.map((c) => (
            <div
              key={c.id}
              onClick={() => onNavigate?.('discover')}
              data-rot={c.rot}
              data-depth={c.depth}
              className={`landing-card landing-card-${c.id} absolute rounded-2xl overflow-hidden cursor-pointer pointer-events-auto transition-shadow duration-500`}
            >
              <img src={c.src} alt={c.alt} className="w-full h-full object-cover object-top block" />
            </div>
          ))}
        </div>

        <div id="landingSubline" className="landing-subline relative z-10 text-center mt-44 sm:mt-48">
          <button
            onClick={() => onNavigate?.('discover')}
            className="landing-arrow-pill"
          >
            <span className="text-white font-semibold">See the lineup</span>
            <span className="landing-ar w-6 h-6 rounded-full bg-gradient-to-b from-[var(--orange-1,#d9351f)] to-[var(--orange-3,#f58b4e)] flex items-center justify-center text-white shrink-0 shadow-sm">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="7" y1="17" x2="17" y2="7" />
                <polyline points="7 7 17 7 17 17" />
              </svg>
            </span>
          </button>
          <div className="landing-subline-text mt-5 text-xs sm:text-sm text-[var(--mute)] tracking-wider">
            Thousands of artists. Millions of fans. One platform.
          </div>
        </div>
      </section>

      {/* ============ SECTION 2: PASSPORT & LINEUP ============ */}
      <section className="landing-team-section relative z-10 py-24 px-6 max-w-7xl mx-auto">
        <div className="landing-team-head flex flex-wrap justify-between items-end gap-8 mb-14">
          <div className="landing-team-head-text max-w-2xl">
            <div className="landing-eyebrow inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[var(--mute)] mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--orange-1)] ring-4 ring-[var(--orange-1)]/20" />
              Music Passport · Collect Memories
            </div>
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight leading-tight text-[var(--ink)]">
              Your personal timeline<br />of <em className="italic bg-gradient-to-r from-[var(--orange-1)] to-[var(--orange-3)] bg-clip-text text-transparent">live music</em>.
            </h2>
          </div>
          <p className="landing-team-head-text text-sm sm:text-base text-[var(--ink-soft)] max-w-md leading-relaxed">
            Every show you attend becomes a permanent stamp in your digital Music Passport. Relive your favorite nights, track your concert history, and share your experiences.
          </p>
        </div>

        <div className="landing-team-grid grid grid-cols-2 md:grid-cols-4 gap-5">
          {TEAM_CARDS.map((card, idx) => (
            <div
              key={idx}
              onClick={() => onNavigate?.('discover')}
              className="landing-t-card group relative aspect-[3/4] rounded-2xl overflow-hidden cursor-pointer shadow-lg transition-transform duration-500 hover:-translate-y-2 hover:-rotate-1"
            >
              <img src={card.src} alt={card.name} className="w-full h-full object-cover object-top" />
              <div className="landing-t-meta absolute inset-x-3 bottom-3 p-3 rounded-xl bg-black/75 backdrop-blur-md border border-white/10 text-white translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                <div className="text-xs sm:text-sm font-bold truncate">{card.name}</div>
                <div className="text-[10px] sm:text-xs text-white/70 tracking-wide mt-0.5">{card.role}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <button
            onClick={() => onNavigate?.('passport')}
            className="cohear-primary px-6 py-3 font-semibold text-sm rounded-full shadow-lg"
          >
            Explore Music Passport
          </button>
        </div>
      </section>

      {/* ============ SECTION 3: STATS ============ */}
      <section className="landing-stats py-16 px-6 max-w-7xl mx-auto">
        <div className="landing-stats-inner relative rounded-3xl p-10 sm:p-16 bg-[#141416] text-[#f4edde] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 items-end overflow-hidden shadow-2xl">
          <div className="relative z-10 col-span-1 sm:col-span-2 lg:col-span-1">
            <h3 className="text-3xl font-bold tracking-tight leading-tight">
              Global reach.<br />Local <em className="italic bg-gradient-to-r from-[var(--orange-3)] to-[var(--orange-4)] bg-clip-text text-transparent">sounds</em>.
            </h3>
          </div>

          <div className="landing-stat-block relative z-10" onClick={() => onNavigate?.('discover')}>
            <div className="num text-4xl sm:text-5xl font-bold tracking-tight flex items-baseline gap-1" data-count="15000">
              <span>0</span>
            </div>
            <div className="lbl text-xs uppercase tracking-widest text-[var(--mute)] mt-3 pt-3 border-t border-white/15">
              Concerts Played
            </div>
          </div>

          <div className="landing-stat-block relative z-10" onClick={() => onNavigate?.('discover')}>
            <div className="num text-4xl sm:text-5xl font-bold tracking-tight flex items-baseline gap-1" data-count="350">
              <span>0</span>
            </div>
            <div className="lbl text-xs uppercase tracking-widest text-[var(--mute)] mt-3 pt-3 border-t border-white/15">
              Artists on Tour
            </div>
          </div>

          <div className="landing-stat-block relative z-10" onClick={() => onNavigate?.('live')}>
            <div className="num text-4xl sm:text-5xl font-bold tracking-tight flex items-baseline gap-1" data-count="2">
              <span>0</span><small className="text-xl text-[var(--mute)]">M</small>
            </div>
            <div className="lbl text-xs uppercase tracking-widest text-[var(--mute)] mt-3 pt-3 border-t border-white/15">
              Active Fans
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
