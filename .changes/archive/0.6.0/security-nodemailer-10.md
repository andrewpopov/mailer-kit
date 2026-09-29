---
kind: security
summary: Move to nodemailer 10 to fix GHSA-6vj9-mwq6-2f5v (cross-transport TLS servername reuse that can disclose SMTP credentials)
---

GHSA-6vj9-mwq6-2f5v: nodemailer's process-global DNS cache could reuse a
TLS servername across transports, letting one transport's connection be
matched against another's certificate and potentially disclosing SMTP
credentials. Affected versions were >=5.0.0 <10.0.2; this package now
depends on nodemailer ^10.0.12. nodemailer 10 requires Node.js 20 or
newer, which is already this package's engines floor, so no runtime
requirement changed. The @types/nodemailer devDependency is also gone —
nodemailer 10 is written in TypeScript and ships its own declarations.
