// client.ts
import nodemailer, { type Transporter } from "nodemailer";
import { mailerConfig } from "@/config";

let transporter: Transporter | null = null;

export function getMailer(): Transporter {
    if (transporter) return transporter;
    transporter = mailerConfig.useTestTransport
        ? nodemailer.createTransport({ jsonTransport: true })
        : nodemailer.createTransport({
            host: mailerConfig.host,
            port: mailerConfig.port,
            secure: mailerConfig.secure,
            auth: mailerConfig.user
                ? { user: mailerConfig.user, pass: mailerConfig.pass }
                : undefined,
        });
    return transporter;
}
