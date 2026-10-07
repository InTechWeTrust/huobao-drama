# Ruby Library in Huobao — issue 185

## ไทย

เปิด Settings → AI → Local production settings → Local generation

- รายการ preset แบ่งเป็น **Active / Lab / Old** ตามสถานะจาก Ruby
- **Active** ที่รองรับโมเดลในเครื่องและตรวจ schema สำเร็จ ใช้เป็นค่าเริ่มต้นและสร้างสื่อได้
- **Lab** มีป้าย Lab และเปิดดูคำอธิบาย/controls ได้ แต่ใช้สร้างสื่อหรือบันทึก controls ไม่ได้
- เลือก **Show Old** เพื่อดู Old; ปิดตัวเลือกนี้เพื่อซ่อนอีกครั้ง
- กด **Refresh Library presets** หลังเปลี่ยนสถานะใน Ruby
- Huobao ตรวจสถานะใหม่ก่อนบันทึกค่าและก่อนส่งงาน ค่าเดิมไม่ถูกเขียนทับเมื่อ preset กลายเป็น Lab/Old

## English

Open Settings → AI → Local production settings → Local generation. The Library picker shows Active first, then Lab. Show Old explicitly includes the Old group. Refresh Library presets rereads the Ruby register.

Only Active presets with verified local Qwen-Image 2.1 or MiniMax H3 support can generate media or save generation controls. Lab and Old are inspectable. Existing project/model IDs and saved values remain unchanged; moving a source card between states does not silently select a replacement.

The wire contract remains lowercase `active`, `lab`, `old`; UI labels are exactly Active, Lab, Old. Huobao reads `/api/presets?state=all`, preserves source fields including `job_key` and `superseded_by`, and serves the local catalogue through `/api/v1/settings/ruby-media/presets`. Old is omitted unless `show_old=1`; requesting one preset by its explicit ID also permits read-only inspection. Generation, preview, defaults and control writes continue through the Active-only validator.

This is the existing local image/video catalogue: cloud and repair cards are excluded. Unsupported or currently unverifiable local model entries remain visible, with generation disabled. No Huobao workflow import/copy system or automatic reimport was introduced; the receipt-filing requirement in issue185 applies to VLO.

## Verification

CPU tests use one module per process and an isolated database/data/temp root. Run `node --import tsx --test tests/ruby-preset-catalogue.test.ts` and `tests/ruby-media.test.ts` individually in backend. The route module `tests/ruby-library-state-routes.test.ts` requires `HUOBAO_TEST_ROOT` as an absolute isolated scratch directory (on the owner's Windows machine: under `E:/rubyapp/scratch`). Set `MYSQL_AUTO_IMPORT=false` and disable dotenv production configuration before importing app modules. Execute with a network fence; mocks do not authorize real connections.

The frontend executable component test is `node --test tests/ruby-library-state.test.mjs` in frontend. It compiles the actual Vue component, renders it, and invokes its actual Show Old and inspection handlers using mock API replies.

Backend typecheck and offline `nuxt generate` are also required. CPU verification is not live acceptance: the real four-app state transition, idle joint deployment, owner cold start and render acceptance remain the integration owner's work.
