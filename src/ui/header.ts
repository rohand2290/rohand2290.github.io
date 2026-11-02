import type { WeatherMode } from '../scene/world';
import type { Sound } from '../weather/audio';

const MODES: { id: WeatherMode; label: string }[] = [
  { id: 'storm', label: 'Storm' },
  { id: 'drizzle', label: 'Drizzle' },
  { id: 'clear', label: 'Clear evening' },
];

/** "Sound" and "Weather" toggles in the top right. */
export function initHeader(sound: Sound, onWeather: (mode: WeatherMode) => void) {
  const soundBtn = document.getElementById('sound-toggle') as HTMLButtonElement;
  const weatherBtn = document.getElementById('weather-toggle') as HTMLButtonElement;

  const renderSound = () => {
    soundBtn.textContent = `Sound: ${sound.enabled ? 'on' : 'off'}`;
    soundBtn.setAttribute('aria-pressed', String(sound.enabled));
  };
  renderSound();
  soundBtn.addEventListener('click', () => {
    const on = !sound.enabled;
    // A little rising chime confirms sound is now on.
    void sound.setEnabled(on).then(() => on && sound.play('soundOn'));
    renderSound();
  });

  // A remembered "on" can only start audio after the visitor's first interaction.
  if (sound.enabled) {
    const wake = () => {
      void sound.setEnabled(true);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
  }

  let mode = 0;
  const renderWeather = () => {
    weatherBtn.textContent = `Weather: ${MODES[mode].label}`;
    weatherBtn.setAttribute('aria-label', `Weather: ${MODES[mode].label}. Change weather`);
  };
  renderWeather();
  weatherBtn.addEventListener('click', () => {
    mode = (mode + 1) % MODES.length;
    sound.play('click');
    renderWeather();
    onWeather(MODES[mode].id);
  });
}
