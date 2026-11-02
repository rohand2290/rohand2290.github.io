---
island: arcade
title: chip8monad
eyebrow: Arcade · Systems
summary: A CHIP-8 emulator written in Haskell, built around the State monad.
links:
  - { label: Repo, href: "https://github.com/rohand2290/chip8monad" }
order: 1
---
CHIP-8 has a small instruction set, which makes it a common first emulator. What made this one interesting was the language. An emulator is mostly state: registers, memory, a stack, a display buffer. Haskell, on the other hand, is pure, so no function can quietly change any of it. Each instruction became a function from one CPU value to the next. Clearing the screen, for example, takes a CPU and returns a new CPU with blank display memory. Threading that value through every opcode by hand gets noisy fast, so I wrote the instructions in the `State` monad. The code reads like step-by-step updates while staying pure underneath. ROMs run from the command line, with the CHIP-8 hex keypad mapped onto the left side of a standard keyboard.

Stack: Haskell, Cabal
