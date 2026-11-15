const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(`${__dirname}/index.html`, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const loaded = new Set();
const elements = new Map();

class TestAudio {
    constructor(src) {
        this.src = src;
        this.playing = false;
        if (src) loaded.add(this);
    }

    play() {
        if (loaded.size > 3) {
            const rejected = Promise.reject(new Error('Too many media resources'));
            rejected.catch(() => {});
            return rejected;
        }
        this.playing = true;
        return Promise.resolve();
    }

    pause() { this.playing = false; }
    addEventListener() {}
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    load() { if (!this.src) loaded.delete(this); }
}

const audioPlayer = new TestAudio();
const context = vm.createContext({
    document: {
        readyState: 'loading',
        getElementById: id => {
            if (id === 'audioPlayer') return audioPlayer;
            if (!elements.has(id)) elements.set(id, { textContent: '' });
            return elements.get(id);
        },
        addEventListener() {}
    },
    location: { hostname: 'example.github.io', port: '' },
    Audio: TestAudio,
    alert(message) { throw new Error(message); },
    console
});
const app = vm.runInContext(`${script}\napp`, context);
app.renderAmbienceDeck = () => {};
app.localMusicUrls = new Map(Array.from({ length: 4 }, (_, i) =>
    [`/music/ambience/${i}.mp3`, `blob:ambience-${i}`]));

(async () => {
    for (let i = 0; i < 3; i++) {
        const path = `/music/ambience/${i}.mp3`;
        app.toggleAmbience(path, `${i}.mp3`);
        await Promise.resolve();
        assert.equal(app.activeAmbiences.get(path).audio.playing, true);
        app.toggleAmbience(path, `${i}.mp3`);
    }

    const fourth = '/music/ambience/3.mp3';
    app.toggleAmbience(fourth, '3.mp3');
    await Promise.resolve();
    assert.equal(app.activeAmbiences.get(fourth).audio.playing, true,
        'the fourth atmosphere must start without reloading the page');
    assert.equal(loaded.size, 1, 'stopped atmospheres must release their media resources');
    app.toggleAmbience(fourth, '3.mp3');

    for (let i = 0; i < 4; i++) {
        app.toggleAmbience(`/music/ambience/${i}.mp3`, `${i}.mp3`);
    }
    await Promise.resolve();
    assert.equal(app.activeAmbiences.has(fourth), false,
        'a failed start must not leave the button marked active');
    assert.match(elements.get('ambienceStatus').textContent, /Impossibile avviare/);
    console.log('Ambience playback survives repeated track changes');
})().catch(error => { console.error(error); process.exitCode = 1; });
