import {resolve} from 'node:path';

// These tests read the installed client; they do not launch or modify it.
const base=process.env.TSIX_CLIENT_PATH || (process.env.LOCALAPPDATA && resolve(process.env.LOCALAPPDATA,'Programs','TeamSpeak'));
if(!base)throw Error('Set TSIX_CLIENT_PATH to the supported TeamSpeak installation for native-component tests.');
export const clientPath=resolve(base);
