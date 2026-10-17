// General MIDI names and the short aliases our notation accepts.

/** General MIDI instruments; the index is the program number (0-127). */
export const GM_PATCHES = [
  "Acoustic Grand Piano", "Bright Acoustic Piano", "Electric Grand Piano", "Honky-tonk Piano",
  "Electric Piano 1", "Electric Piano 2", "Harpsichord", "Clavinet",
  "Celesta", "Glockenspiel", "Music Box", "Vibraphone",
  "Marimba", "Xylophone", "Tubular Bells", "Dulcimer",
  "Drawbar Organ", "Percussive Organ", "Rock Organ", "Church Organ",
  "Reed Organ", "Accordion", "Harmonica", "Tango Accordion",
  "Acoustic Guitar (nylon)", "Acoustic Guitar (steel)", "Electric Guitar (jazz)", "Electric Guitar (clean)",
  "Electric Guitar (muted)", "Overdriven Guitar", "Distortion Guitar", "Guitar Harmonics",
  "Acoustic Bass", "Electric Bass (finger)", "Electric Bass (pick)", "Fretless Bass",
  "Slap Bass 1", "Slap Bass 2", "Synth Bass 1", "Synth Bass 2",
  "Violin", "Viola", "Cello", "Contrabass",
  "Tremolo Strings", "Pizzicato Strings", "Orchestral Harp", "Timpani",
  "String Ensemble 1", "String Ensemble 2", "Synth Strings 1", "Synth Strings 2",
  "Choir Aahs", "Voice Oohs", "Synth Voice", "Orchestra Hit",
  "Trumpet", "Trombone", "Tuba", "Muted Trumpet",
  "French Horn", "Brass Section", "Synth Brass 1", "Synth Brass 2",
  "Soprano Sax", "Alto Sax", "Tenor Sax", "Baritone Sax",
  "Oboe", "English Horn", "Bassoon", "Clarinet",
  "Piccolo", "Flute", "Recorder", "Pan Flute",
  "Blown Bottle", "Shakuhachi", "Whistle", "Ocarina",
  "Lead 1 (square)", "Lead 2 (sawtooth)", "Lead 3 (calliope)", "Lead 4 (chiff)",
  "Lead 5 (charang)", "Lead 6 (voice)", "Lead 7 (fifths)", "Lead 8 (bass + lead)",
  "Pad 1 (new age)", "Pad 2 (warm)", "Pad 3 (polysynth)", "Pad 4 (choir)",
  "Pad 5 (bowed)", "Pad 6 (metallic)", "Pad 7 (halo)", "Pad 8 (sweep)",
  "FX 1 (rain)", "FX 2 (soundtrack)", "FX 3 (crystal)", "FX 4 (atmosphere)",
  "FX 5 (brightness)", "FX 6 (goblins)", "FX 7 (echoes)", "FX 8 (sci-fi)",
  "Sitar", "Banjo", "Shamisen", "Koto",
  "Kalimba", "Bagpipe", "Fiddle", "Shanai",
  "Tinkle Bell", "Agogo", "Steel Drums", "Woodblock",
  "Taiko Drum", "Melodic Tom", "Synth Drum", "Reverse Cymbal",
  "Guitar Fret Noise", "Breath Noise", "Seashore", "Bird Tweet",
  "Telephone Ring", "Helicopter", "Applause", "Gunshot",
];

/** General MIDI drum sounds on channel 9; index 0 is note 35. */
export const GM_DRUM_FIRST = 35;
export const GM_DRUMS = [
  "Acoustic Bass Drum", "Bass Drum 1", "Side Stick", "Acoustic Snare",
  "Hand Clap", "Electric Snare", "Low Floor Tom", "Closed Hi-Hat",
  "High Floor Tom", "Pedal Hi-Hat", "Low Tom", "Open Hi-Hat",
  "Low-Mid Tom", "Hi-Mid Tom", "Crash Cymbal 1", "High Tom",
  "Ride Cymbal 1", "Chinese Cymbal", "Ride Bell", "Tambourine",
  "Splash Cymbal", "Cowbell", "Crash Cymbal 2", "Vibraslap",
  "Ride Cymbal 2", "Hi Bongo", "Low Bongo", "Mute Hi Conga",
  "Open Hi Conga", "Low Conga", "High Timbale", "Low Timbale",
  "High Agogo", "Low Agogo", "Cabasa", "Maracas",
  "Short Whistle", "Long Whistle", "Short Guiro", "Long Guiro",
  "Claves", "Hi Wood Block", "Low Wood Block", "Mute Cuica",
  "Open Cuica", "Mute Triangle", "Open Triangle",
];

/** Short instrument names, mapped to program numbers. */
export const INST_ALIAS = {
  "piano": 0, "grand piano": 0, "electric piano": 4, "epiano": 4,
  "rhodes": 4, "harpsichord": 6, "bells": 14, "organ": 16,
  "rock organ": 18, "guitar": 25, "acoustic guitar": 25, "nylon guitar": 24,
  "electric guitar": 27, "clean guitar": 27, "muted guitar": 28, "overdrive": 29,
  "distortion": 30, "bass": 33, "electric bass": 33, "pick bass": 34,
  "slap bass": 36, "synth bass": 38, "strings": 48, "string ensemble": 48,
  "pizzicato": 45, "harp": 46, "choir": 52, "voice": 53,
  "trumpet": 56, "trombone": 57, "horn": 60, "brass": 61,
  "sax": 65, "saxophone": 65, "flute": 73, "lead": 80,
  "square lead": 80, "saw lead": 81, "pad": 89, "warm pad": 89,
};

/** Short drum names, mapped to note numbers on channel 9. */
export const DRUM_ALIAS = {
  "kick": 36, "bd": 36, "bass drum": 36, "snare": 38,
  "sd": 38, "clap": 39, "hat": 42, "hh": 42,
  "hihat": 42, "hi-hat": 42, "closed hat": 42, "open hat": 46,
  "oh": 46, "pedal hat": 44, "crash": 49, "ride": 51,
  "ride bell": 53, "rim": 37, "side stick": 37, "high tom": 50,
  "tom": 47, "mid tom": 47, "low tom": 45, "floor tom": 41,
  "cowbell": 56, "tambourine": 54, "shaker": 70, "claves": 75,
};
