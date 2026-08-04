# YOS Weixin Channel Development Plan

1. Lock Tencent upstream source and license evidence.
   Verification: repository contract matches tag, commit and archive digest.
2. Import only the iLink protocol modules needed for the alpha.
   Verification: protocol tests cover URL restrictions, redaction and failures.
3. Replace host account, state and logging services with private YOS storage.
   Verification: permissions and restart persistence tests pass.
4. Connect inbound and outbound paths to C4.
   Verification: original message ID and account/context reply routing are tested.
5. Add component lifecycle and package gates.
   Verification: hook tests, audit, dry-run manifest and whole-repository gate pass.
6. Submit a locked candidate for independent real Weixin acceptance.
   Verification: QR login, private message/reply, process restart and purge are
   tested on an isolated YOS instance before merge or publication.
