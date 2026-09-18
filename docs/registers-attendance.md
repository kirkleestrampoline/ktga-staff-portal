# Registers attendance notes

Individual unmarking uses the existing `attendance_command` with `status = 'unmarked'`, a null arrival time and null note. It retains the attendance row, writes the prior values to the append-only audit, and uses the existing request receipt.

Transactional register-wide clearing is intentionally deferred. The current deployed command is record-scoped, so a future enhancement needs a reviewed occurrence-scoped batch command before “Clear all marks” can be added safely.
