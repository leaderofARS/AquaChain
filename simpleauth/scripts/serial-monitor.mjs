import 'dotenv/config';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

const portPath = process.env.SERIAL_PORT || 'COM3';
const baudRate = Number(process.env.SERIAL_BAUD || 115200);
const shouldReset = String(process.env.SERIAL_RESET || 'true').toLowerCase() === 'true';

async function openPort() {
  const port = new SerialPort({ path: portPath, baudRate, autoOpen: true });
  const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

  port.on('open', async () => {
    console.log(`[serial] Opened ${portPath} @ ${baudRate}`);
    if (shouldReset) {
      try {
        // Toggle DTR/RTS to reset ESP32
        await port.set({ dtr: false, rts: true });
        await new Promise(r => setTimeout(r, 50));
        await port.set({ dtr: true, rts: false });
        await new Promise(r => setTimeout(r, 50));
        await port.set({ dtr: true, rts: true });
        console.log('[serial] DTR/RTS toggled for reset');
      } catch (e) {
        console.warn('[serial] Reset toggle failed:', e.message);
      }
    }
  });

  port.on('error', (err) => {
    console.error('[serial] Error:', err.message);
  });

  port.on('close', () => {
    console.log('[serial] Port closed');
    // Attempt auto-reconnect after delay
    setTimeout(() => openPort().catch(()=>{}), 2000);
  });

  parser.on('data', (line) => {
    console.log(`[serial] ${line}`);
  });
}

openPort().catch((e) => {
  console.error('[serial] Failed to open port:', e);
  process.exit(1);
});

