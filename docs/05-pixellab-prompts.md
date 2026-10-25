# Câu lệnh tạo sprite trên PixelLab (làm tay trên web)

Dùng khi muốn tự tạo trên https://www.pixellab.ai thay vì chạy `npm run monster-sprites` / `champ-sprites`. Prompt giống hệt prompt script dùng, nên ảnh làm tay và ảnh script vẽ cùng phong cách.

## Thiết lập chung

Tên công cụ/nút trên web PixelLab có thể khác một chút so với ở đây (tài liệu này dựa trên API v2); các thông số thì giống nhau.

**Bước 1: ảnh gốc**, dùng công cụ *Create image* (model **Pixflux**):

| Mục | Giá trị |
|---|---|
| Size | 64 x 64 (quái lớn ghi 96 x 96) |
| View | side |
| Direction | east (quay sang phải) |
| No background | bật |
| Outline | single color black outline |
| Shading | medium shading |
| Detail | highly detailed |

**Bước 2: animation**, dùng *Animate* (model **PixMiniMax**) với ảnh gốc ở bước 1 làm khung đầu:

| Animation | Số khung | Prompt chuyển động |
|---|---|---|
| idle | 4 | `idle stance, gentle breathing and slight bobbing in place, loops seamlessly` |
| attack | 8 | `performs a powerful attack toward the right (strike, bite, breath or spell), then returns to the starting pose` |

Các ô khác: View `side`, Direction `east`, No background bật, Initial pose `standing idle facing right`, Subject description: dán lại đúng prompt ảnh gốc (bỏ phần `pixel art game sprite of` và `, full body, …`).

## Lưu file vào repo

Tải về rồi đặt vào `data/packs/real-2026/sprites/<ID>/` (ID ghi ở mỗi mục bên dưới):

```
base.png                 ảnh gốc
idle_0.png … idle_4.png  các khung animation idle theo thứ tự (khung 0 = ảnh gốc)
attack_0.png … attack_8.png
```

Nếu web chỉ cho tải spritesheet hoặc GIF, gửi file đó cho Claude để tách thành từng khung. App tự nhận ảnh khi build lại; thiếu animation thì dùng ảnh gốc, thiếu cả ảnh gốc thì không hiện gì.

## Quái

### Baron Nashor — `BARON` (96x96)

```
pixel art game sprite of Baron Nashor from League of Legends: giant purple void serpent worm with spikes, a huge horned head and many eyes, full body, standing idle, facing right
```

### Elder Dragon — `DRAGON_ELDER` (96x96)

```
pixel art game sprite of Elder Dragon from League of Legends: huge ancient purple-blue celestial dragon with glowing cosmic flames and big wings, full body, standing idle, facing right
```

### Rift Herald — `HERALD` (96x96)

```
pixel art game sprite of Rift Herald from League of Legends: purple void crab-like creature with a big eye on its back and a long tail, full body, standing idle, facing right
```

### Atakhan — `ATAKHAN` (96x96)

```
pixel art game sprite of Atakhan from League of Legends: huge dark crimson demon with large horns, wings and blood magic, full body, standing idle, facing right
```

### Infernal Drake — `DRAGON_INFERNAL` (64x64)

```
pixel art game sprite of Infernal Drake from League of Legends: red fire dragon drake with molten cracks and burning wings, full body, standing idle, facing right
```

### Ocean Drake — `DRAGON_OCEAN` (64x64)

```
pixel art game sprite of Ocean Drake from League of Legends: blue-green water dragon drake with fins and flowing water, full body, standing idle, facing right
```

### Mountain Drake — `DRAGON_MOUNTAIN` (64x64)

```
pixel art game sprite of Mountain Drake from League of Legends: brown rocky earth dragon drake covered in stone plates, full body, standing idle, facing right
```

### Cloud Drake — `DRAGON_CLOUD` (64x64)

```
pixel art game sprite of Cloud Drake from League of Legends: pale white-blue wind dragon drake with wispy cloud wings, full body, standing idle, facing right
```

### Hextech Drake — `DRAGON_HEXTECH` (64x64)

```
pixel art game sprite of Hextech Drake from League of Legends: blue and gold mechanical hextech dragon drake crackling with blue energy, full body, standing idle, facing right
```

### Chemtech Drake — `DRAGON_CHEMTECH` (64x64)

```
pixel art game sprite of Chemtech Drake from League of Legends: toxic green chemtech dragon drake with tubes and glowing green fumes, full body, standing idle, facing right
```

### Voidgrub — `VOIDGRUB` (64x64)

```
pixel art game sprite of Voidgrub from League of Legends: small purple void larva bug with spikes, full body, standing idle, facing right
```

### Blue Sentinel — `BLUE_SENTINEL` (64x64)

```
pixel art game sprite of Blue Sentinel from League of Legends: big stone golem with a glowing blue rune crest, full body, standing idle, facing right
```

### Red Brambleback — `RED_BRAMBLEBACK` (64x64)

```
pixel art game sprite of Red Brambleback from League of Legends: big red thorny bramble beast with glowing red eyes, full body, standing idle, facing right
```

### Gromp — `GROMP` (64x64)

```
pixel art game sprite of Gromp from League of Legends: giant fat toad frog with green and yellow skin, full body, standing idle, facing right
```

### Ancient Krug — `KRUG` (64x64)

```
pixel art game sprite of Ancient Krug from League of Legends: big rock creature made of boulders with a mossy back, full body, standing idle, facing right
```

### Crimson Raptor — `RAPTOR` (64x64)

```
pixel art game sprite of Crimson Raptor from League of Legends: red bird-like raptor creature with a sharp beak, full body, standing idle, facing right
```

### Greater Murk Wolf — `MURK_WOLF` (64x64)

```
pixel art game sprite of Greater Murk Wolf from League of Legends: dark shadowy wolf with glowing blue eyes, full body, standing idle, facing right
```

### Rift Scuttler — `SCUTTLE_CRAB` (64x64)

```
pixel art game sprite of Rift Scuttler from League of Legends: cute blue and orange river crab with a shell, full body, standing idle, facing right
```

### Melee Minion — `MINION_MELEE` (64x64)

```
pixel art game sprite of Melee Minion from League of Legends: small armored blue soldier minion with a sword and shield, full body, standing idle, facing right
```

### Caster Minion — `MINION_CASTER` (64x64)

```
pixel art game sprite of Caster Minion from League of Legends: small hooded blue mage minion with a staff, full body, standing idle, facing right
```

### Siege Minion — `MINION_CANNON` (64x64)

```
pixel art game sprite of Siege Minion from League of Legends: small blue cannon cart minion on wheels, full body, standing idle, facing right
```

### Super Minion — `MINION_SUPER` (64x64)

```
pixel art game sprite of Super Minion from League of Legends: big bulky blue armored super minion with huge fists, full body, standing idle, facing right
```

## Tướng

Size 64 x 64 cho tất cả. Ảnh gốc: dán dòng prompt; animation dùng 2 prompt chuyển động ở trên.

| ID | Prompt ảnh gốc |
|---|---|
| `KSANTE` | pixel art game sprite of K'Sante from League of Legends: tall muscular dark-skinned warrior with a massive stone-and-metal double-ended shield weapon, gold and white armor, full body, standing idle, facing right |
| `GNAR` | pixel art game sprite of Gnar from League of Legends: small orange furry prehistoric yordle creature with a bone boomerang, wearing a tooth necklace, full body, standing idle, facing right |
| `JAX` | pixel art game sprite of Jax from League of Legends: lanky fighter in purple armor and a glowing face mask, wielding a street lamp post as a weapon, full body, standing idle, facing right |
| `RENEKTON` | pixel art game sprite of Renekton from League of Legends: huge green crocodile warrior with golden Shuriman armor and a large curved blade, full body, standing idle, facing right |
| `AATROX` | pixel art game sprite of Aatrox from League of Legends: towering dark crimson demon with large bat-like wings and a giant blood-red greatsword, full body, standing idle, facing right |
| `RUMBLE` | pixel art game sprite of Rumble from League of Legends: tiny blue yordle piloting a scrappy mech with a flamethrower arm, full body, standing idle, facing right |
| `AMBESSA` | pixel art game sprite of Ambessa from League of Legends: powerful dark-skinned female warlord in red and black Noxian armor wielding a curved blade and a shield-glove, full body, standing idle, facing right |
| `CAMILLE` | pixel art game sprite of Camille from League of Legends: elegant woman in blue and gold Piltover dress with bladed mechanical legs and a grappling hook, full body, standing idle, facing right |
| `ORNN` | pixel art game sprite of Ornn from League of Legends: giant horned ram-like blacksmith god with a hammer, molten lava glowing from his skin, full body, standing idle, facing right |
| `SION` | pixel art game sprite of Sion from League of Legends: massive undead zombie juggernaut with a huge battle axe, rusty armor, glowing red eye, full body, standing idle, facing right |
| `GWEN` | pixel art game sprite of Gwen from League of Legends: doll girl with light blue twin drill pigtails, a black and white frilly dress and giant magic scissors, full body, standing idle, facing right |
| `JAYCE` | pixel art game sprite of Jayce from League of Legends: handsome man in a blue and gold Piltover suit wielding a huge transforming hammer cannon, full body, standing idle, facing right |
| `GRAGAS` | pixel art game sprite of Gragas from League of Legends: fat bearded brawler with a large barrel of glowing ale on his back, full body, standing idle, facing right |
| `VI` | pixel art game sprite of Vi from League of Legends: woman with short pink hair and huge mechanical gauntlet fists, tattoo 'VI' on her face, full body, standing idle, facing right |
| `WUKONG` | pixel art game sprite of Wukong from League of Legends: monkey warrior in golden armor with a long staff and a red headband, full body, standing idle, facing right |
| `LEESIN` | pixel art game sprite of Lee Sin from League of Legends: blindfolded bald martial artist monk with a red blindfold and bare chest, fighting stance, full body, standing idle, facing right |
| `SEJUANI` | pixel art game sprite of Sejuani from League of Legends: fierce warrior woman in fur armor riding a huge boar, holding an ice flail, full body, standing idle, facing right |
| `MAOKAI` | pixel art game sprite of Maokai from League of Legends: giant twisted tree ent with glowing green eyes and gnarled bark arms, full body, standing idle, facing right |
| `XINZHAO` | pixel art game sprite of Xin Zhao from League of Legends: Demacian seneschal warrior with a long spear, blue and gold armor and a ponytail, full body, standing idle, facing right |
| `NIDALEE` | pixel art game sprite of Nidalee from League of Legends: huntress with dark hair, tribal outfit and a spear, jungle themed, full body, standing idle, facing right |
| `VIEGO` | pixel art game sprite of Viego from League of Legends: ruined king with flowing black-green hair, dark crown and a cursed greatsword wreathed in green mist, full body, standing idle, facing right |
| `SKARNER` | pixel art game sprite of Skarner from League of Legends: giant crystal scorpion with purple glowing crystals on its back and pincers, full body, standing idle, facing right |
| `TRUNDLE` | pixel art game sprite of Trundle from League of Legends: huge blue troll king with an icy club and a crown of ice, full body, standing idle, facing right |
| `PANTHEON` | pixel art game sprite of Pantheon from League of Legends: spartan warrior with a crested golden helmet, round shield and a spear, full body, standing idle, facing right |
| `JARVANIV` | pixel art game sprite of Jarvan IV from League of Legends: Demacian prince in golden armor with a crown-helmet and a lance with a banner, full body, standing idle, facing right |
| `AHRI` | pixel art game sprite of Ahri from League of Legends: fox woman with nine white fox tails, fox ears, long black hair and a red and white outfit, holding a glowing orb, full body, standing idle, facing right |
| `AZIR` | pixel art game sprite of Azir from League of Legends: bird-headed falcon emperor with golden Shuriman armor and a staff, sand soldiers, full body, standing idle, facing right |
| `SYLAS` | pixel art game sprite of Sylas from League of Legends: rebel mage with broken chains on his wrists, scruffy hair and a blue and grey outfit, full body, standing idle, facing right |
| `ORIANNA` | pixel art game sprite of Orianna from League of Legends: clockwork doll girl in brass and white metal with a floating mechanical ball, full body, standing idle, facing right |
| `TALIYAH` | pixel art game sprite of Taliyah from League of Legends: young stone weaver girl with a woven shawl and floating rocks, full body, standing idle, facing right |
| `LEBLANC` | pixel art game sprite of LeBlanc from League of Legends: elegant sorceress in purple and gold with a tall headdress and a staff, full body, standing idle, facing right |
| `YONE` | pixel art game sprite of Yone from League of Legends: swordsman with long dark hair, a white and red demon mask on his side and two katanas, full body, standing idle, facing right |
| `VIKTOR` | pixel art game sprite of Viktor from League of Legends: hooded scientist with a mechanical arm and a glowing orange chest core, full body, standing idle, facing right |
| `CORKI` | pixel art game sprite of Corki from League of Legends: tiny yordle pilot with a mustache and goggles flying a small gyrocopter plane, full body, standing idle, facing right |
| `HWEI` | pixel art game sprite of Hwei from League of Legends: painter mage in Ionian robes with a large brush staff, ink paint swirls, full body, standing idle, facing right |
| `RYZE` | pixel art game sprite of Ryze from League of Legends: blue-skinned rune mage with a beard, carrying a big scroll on his back, glowing runes, full body, standing idle, facing right |
| `GALIO` | pixel art game sprite of Galio from League of Legends: giant stone gargoyle colossus with wings and blue glowing eyes, full body, standing idle, facing right |
| `AKALI` | pixel art game sprite of Akali from League of Legends: female ninja with a mask, dark ponytail, green outfit and two kamas, full body, standing idle, facing right |
| `AURORA` | pixel art game sprite of Aurora from League of Legends: bunny-eared spirit girl with a big fluffy hood and blue magic, full body, standing idle, facing right |
| `KAISA` | pixel art game sprite of Kai'Sa from League of Legends: woman in a purple void carapace suit with glowing missile pods on her back, full body, standing idle, facing right |
| `VARUS` | pixel art game sprite of Varus from League of Legends: corrupted archer with a purple glowing bow, half his body twisted by darkin magic, full body, standing idle, facing right |
| `XAYAH` | pixel art game sprite of Xayah from League of Legends: feathered vastaya woman with a hood, purple cloak and feather blades, full body, standing idle, facing right |
| `JINX` | pixel art game sprite of Jinx from League of Legends: manic girl with very long blue braided hair, a big shark-shaped rocket launcher and pink minigun, full body, standing idle, facing right |
| `EZREAL` | pixel art game sprite of Ezreal from League of Legends: young blond explorer with a magical blue gauntlet and a brown jacket, full body, standing idle, facing right |
| `ZERI` | pixel art game sprite of Zeri from League of Legends: girl with green hair in a big ponytail holding an electric rifle, crackling lightning, full body, standing idle, facing right |
| `APHELIOS` | pixel art game sprite of Aphelios from League of Legends: silent assassin in black with a white cloth over his mouth and moon weapons, full body, standing idle, facing right |
| `ASHE` | pixel art game sprite of Ashe from League of Legends: frost archer queen with a white hood, blue cloak and an ice bow, full body, standing idle, facing right |
| `KALISTA` | pixel art game sprite of Kalista from League of Legends: ghostly blue spectral woman with spears and a spectral cape, full body, standing idle, facing right |
| `SMOLDER` | pixel art game sprite of Smolder from League of Legends: small cute orange baby dragon breathing fire, full body, standing idle, facing right |
| `CAITLYN` | pixel art game sprite of Caitlyn from League of Legends: sheriff with long dark hair, a purple top hat and a long sniper rifle, full body, standing idle, facing right |
| `LUCIAN` | pixel art game sprite of Lucian from League of Legends: dark-skinned gunslinger with a long coat and two holy light pistols, full body, standing idle, facing right |
| `SIVIR` | pixel art game sprite of Sivir from League of Legends: mercenary woman with a big cross-shaped boomerang blade and Shuriman outfit, full body, standing idle, facing right |
| `NAUTILUS` | pixel art game sprite of Nautilus from League of Legends: giant deep-sea diver in an old brass diving suit with a huge anchor, full body, standing idle, facing right |
| `RAKAN` | pixel art game sprite of Rakan from League of Legends: charming bird vastaya man with golden feathers and a flamboyant cape, full body, standing idle, facing right |
| `KARMA` | pixel art game sprite of Karma from League of Legends: Ionian spiritual woman with glowing hands, flowing robes and a crown-like headdress, full body, standing idle, facing right |
| `RELL` | pixel art game sprite of Rell from League of Legends: girl in heavy black iron armor riding an iron horse, holding a lance, full body, standing idle, facing right |
| `ALISTAR` | pixel art game sprite of Alistar from League of Legends: massive minotaur with a nose ring, brass armor and broken chains, full body, standing idle, facing right |
| `LULU` | pixel art game sprite of Lulu from League of Legends: tiny purple yordle witch with a big hat and a wand, a fairy companion, full body, standing idle, facing right |
| `BRAUM` | pixel art game sprite of Braum from League of Legends: huge mustached man with a big door-shaped shield, full body, standing idle, facing right |
| `LEONA` | pixel art game sprite of Leona from League of Legends: solari warrior woman with golden armor, a sun shield and a sword, full body, standing idle, facing right |
| `RENATA` | pixel art game sprite of Renata Glasc from League of Legends: businesswoman with a white suit, one mechanical arm, and a chemtech syringe, full body, standing idle, facing right |
| `POPPY` | pixel art game sprite of Poppy from League of Legends: small yordle girl with blond pigtails and a giant hammer, blue armor, full body, standing idle, facing right |
| `THRESH` | pixel art game sprite of Thresh from League of Legends: spectral green warden in dark armor with a glowing lantern and a chain hook, full body, standing idle, facing right |
| `BARD` | pixel art game sprite of Bard from League of Legends: tall cosmic wanderer with a hood and a bell, tiny floating meeps, full body, standing idle, facing right |
| `NEEKO` | pixel art game sprite of Neeko from League of Legends: colorful chameleon vastaya girl with a frilled head and playful colors, full body, standing idle, facing right |
| `SHEN` | pixel art game sprite of Shen from League of Legends: ninja with a blue mask and a spirit blade, purple and blue clothes, full body, standing idle, facing right |
| `MALPHITE` | pixel art game sprite of Malphite from League of Legends: giant walking rock golem made of stone shards, full body, standing idle, facing right |
| `CHOGATH` | pixel art game sprite of Cho'Gath from League of Legends: huge purple void monster with many teeth and spikes, full body, standing idle, facing right |
| `FIORA` | pixel art game sprite of Fiora from League of Legends: Demacian duelist woman with a rapier, short dark hair and blue outfit, full body, standing idle, facing right |
| `KENNEN` | pixel art game sprite of Kennen from League of Legends: tiny ninja yordle with a mask and electric shuriken, blue lightning, full body, standing idle, facing right |
| `DRMUNDO` | pixel art game sprite of Dr. Mundo from League of Legends: giant purple madman with a cleaver and a lab coat, bloated muscles, full body, standing idle, facing right |
| `VOLIBEAR` | pixel art game sprite of Volibear from League of Legends: huge white thunder bear with lightning crackling, wearing a gold armor, full body, standing idle, facing right |
| `URGOT` | pixel art game sprite of Urgot from League of Legends: mechanical crab-like executioner with a shotgun and chains, full body, standing idle, facing right |
| `GRAVES` | pixel art game sprite of Graves from League of Legends: bearded outlaw with a cigar and a big shotgun, leather vest, full body, standing idle, facing right |
| `KINDRED` | pixel art game sprite of Kindred from League of Legends: white lamb spirit with a bow and a black wolf spirit companion, full body, standing idle, facing right |
| `ELISE` | pixel art game sprite of Elise from League of Legends: spider queen woman in red and black with spider legs on her back, full body, standing idle, facing right |
| `NOCTURNE` | pixel art game sprite of Nocturne from League of Legends: dark shadow demon with blades for arms, floating, full body, standing idle, facing right |
| `IVERN` | pixel art game sprite of Ivern from League of Legends: friendly tree man with branch antlers and a little bird nest, full body, standing idle, facing right |
| `ZAC` | pixel art game sprite of Zac from League of Legends: green slime blob creature with a wide grin, full body, standing idle, facing right |
| `RENGAR` | pixel art game sprite of Rengar from League of Legends: lion-like vastaya hunter with a bone mask, knives and a trophy necklace, full body, standing idle, facing right |
| `BELVETH` | pixel art game sprite of Bel'Veth from League of Legends: void empress with purple wings, tentacle hair and claws, full body, standing idle, facing right |
| `SYNDRA` | pixel art game sprite of Syndra from League of Legends: dark sovereign mage woman with a tall helmet and floating dark orbs, full body, standing idle, facing right |
| `TWISTEDFATE` | pixel art game sprite of Twisted Fate from League of Legends: card shark gambler with a wide brimmed hat, long coat and glowing cards, full body, standing idle, facing right |
| `CASSIOPEIA` | pixel art game sprite of Cassiopeia from League of Legends: serpent woman with a snake lower body, green scales and a helmet, full body, standing idle, facing right |
| `ANIVIA` | pixel art game sprite of Anivia from League of Legends: blue ice phoenix bird with crystal wings, full body, standing idle, facing right |
| `ZOE` | pixel art game sprite of Zoe from League of Legends: playful aspect girl with long rainbow flowing hair and a cosmic outfit, full body, standing idle, facing right |
| `VEX` | pixel art game sprite of Vex from League of Legends: gloomy yordle girl with a dark hood and a living shadow companion, full body, standing idle, facing right |
| `MISSFORTUNE` | pixel art game sprite of Miss Fortune from League of Legends: red-haired pirate captain with a tricorn hat and two pistols, full body, standing idle, facing right |
| `DRAVEN` | pixel art game sprite of Draven from League of Legends: flamboyant executioner with a mustache and spinning axes, full body, standing idle, facing right |
| `TRISTANA` | pixel art game sprite of Tristana from League of Legends: tiny yordle gunner with a big cannon and goggles, full body, standing idle, facing right |
| `NILAH` | pixel art game sprite of Nilah from League of Legends: joyful warrior with a water whip blade and a sunlit outfit, full body, standing idle, facing right |
| `VAYNE` | pixel art game sprite of Vayne from League of Legends: night hunter with sunglasses, a black leather outfit and a wrist crossbow, full body, standing idle, facing right |
| `YUNARA` | pixel art game sprite of Yunara from League of Legends: Ionian archer woman with a flowing scarf and a spiritual bow, full body, standing idle, facing right |
| `MILIO` | pixel art game sprite of Milio from League of Legends: young boy with a fire spirit companion and warm orange colors, full body, standing idle, facing right |
| `TAHMKENCH` | pixel art game sprite of Tahm Kench from League of Legends: giant catfish river king in a top hat and suit, full body, standing idle, facing right |
| `BLITZCRANK` | pixel art game sprite of Blitzcrank from League of Legends: large steam golem robot with big mechanical arms and a yellow body, full body, standing idle, facing right |
| `PYKE` | pixel art game sprite of Pyke from League of Legends: drowned harpooner with a hood, a big harpoon and glowing green eyes, full body, standing idle, facing right |
| `SERAPHINE` | pixel art game sprite of Seraphine from League of Legends: pop star girl with pink hair, a floating stage speaker and a microphone, full body, standing idle, facing right |
| `NAMI` | pixel art game sprite of Nami from League of Legends: mermaid with a fish tail and a coral staff, water magic, full body, standing idle, facing right |
| `YUUMI` | pixel art game sprite of Yuumi from League of Legends: small magical cat sitting on a talking book, full body, standing idle, facing right |
