# Seo-rin Huobao preparation checkpoint

Owner app: Huobao Drama, native drama 2 / episode 2.
Open http://127.0.0.1:5679/drama/2/episode/1 (the URL uses episode number 1).

The source media project `E:\Media\Rubyapp\Project\seorin-claude` was
copied to `E:\Media\Huobao\Project\seorin-huobao-test3`: 557 original
files, 3,538,367,328 bytes. The source project was not edited.
The old copied exports are source material, not the newly requested final.

## Prepared content

- 93 native storyboards, 489 seconds (8:09), 11,736 frames at 24 fps.
- 10 character entities: 7 preserved cast identities and 3 separately
  described thug identities with distinct faces, outfits and seeds.
- 9 scene entities. Original store interior 337 is used for interior guidance;
  exterior 322 remains the opening storefront guide. Seo-rin 316 remains the
  identity/costume anchor. The old lookalike-thug frame is not an accepted start.
- All 30 original Thai/English/Korean dialogue records retained verbatim.
  Existing dialogue WAVs were normalized and padded on CPU to 48 kHz mono;
  source hashes, named speakers and timing are recorded. The new drive files
  are in `03 Audio\drive-v2`. Voice consistency by listening remains unverified.
- Readable individual action exchanges, explicit prop pickup/putdown,
  consequences, payment before exit, rescue, hairpin retrieval and emotional
  pauses. Scene geometry no longer resets actors/restraints after actions.
- Both default and episode brain set to `gpt-6.1-sol` / `xhigh`.
  A real native Huobao brain probe passed. Sol 6.1 also reviewed the repaired
  warehouse excerpt successfully; this is not a whole-film media-quality pass.
- Episode resolution 480p. Staged video controls specify 832x480 for the action
  card and 0.38 MP / 1x for the dialogue card; representative previews report
  native 480-height delivery without enhancement. Actual clip sizes await GPU.

## Not ready for the stopwatch

No generation task or merge task was submitted for episode 2. The user asked
to be notified when all preparation excluding GPU is complete, then start timing.
That gate remains closed. The three new references, shot frames, videos and
final mix/export have not been generated.

The installed Huobao uses Ruby's backend contracts and render queue behind its
own UI. A question about accepting this shared renderer or requiring a direct
Huobao-to-ComfyUI route remains unanswered. Do not infer permission from time.
Current non-GPU blockers on the installed route:

1. Ruby's `huobao` project registration still points to the old Ruby media root.
   The staged Huobao root mapping requires the original offline maintenance
   controller and a quiet owner-coordinated window. Do not edit the Ruby database
   directly, restart another owner's service, or bypass the mapping guard.
2. The dialogue card binds `drive_audio`, but native shot preview marks its
   required `music` binding missing. The installed Ruby HTTP `ShotRequest`
   does not expose `music`, so adding it to Huobao's request alone is insufficient.
3. The silent action preview reports blocked prompt output: the selected
   MiniMax H3 JSON adapter requires a canonical JSON projection absent from the
   raw-shot request. Do not treat HTTP 200 or bound values as render admission.

The native merge also skips missing shot clips and concatenates directly; final
delivery must verify all 93 accepted clips and implement the planned audio mix,
continuity edits and final fade. A partial concatenation is not final delivery.

## Evidence and next work

Film-local `Preparation` contains `production-plan.json`, `screenplay.md`,
`preflight-report.json`, staged `render-controls.json`, `edit-timeline.json`,
source snapshots, brain receipts and dialogue/silent preview receipts. Runtime
helpers are in `E:\Media\Huobao\Temp\seorin-huobao-test3-session` and operate
only on this film/native drama. Media, state, scratch and databases stay out of Git.

Resolve the renderer preference and the installed admission blockers, then
validate the final queue request without submitting it. Only then report
preparation ready and wait for the user's timing start. After that, qualify
the three distinct thug references, one dialogue take and one action take at
480p before full production. Inspect and repair each scene, mix the locked
voices with continuous ambience/foley and ducked music, export and inspect
the complete movie.

Planned final path (does not exist at this checkpoint):
`E:\Media\Huobao\Project\seorin-huobao-test3\02 Output\final\seorin-huobao-test3-final-480p.mp4`.

This checkpoint changes native project data and adds this report. It makes no
render-adapter code change and no GPU request. Roll back this report with its
local Git commit; preserve the film-local data until the user asks otherwise.
