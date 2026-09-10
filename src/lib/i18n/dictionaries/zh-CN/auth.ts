import type { DictionaryValue, TranslationParams } from "../../types";

/**
 * zh-CN `auth` module — mirrors `dictionaries/en/auth.ts` exactly.
 * Prefix/suffix pieces keep the same composition as English so the JSX
 * can interleave the email/link unchanged.
 */
export const auth = {
  "auth.heading.signIn": "欢迎回来",
  "auth.heading.signUp": "创建你的账户",
  "auth.toggle.toSignUp": "新用户？创建账户",
  "auth.toggle.toSignIn": "已有账户？登录",
  "auth.tagline": "安静做事，尽在掌握。",
  "auth.loading": "加载中…",
  "auth.error.authFailed": "认证失败，请重试。",
  "auth.error.unexpected": "发生了意外错误",
  "auth.error.authFailedFallback": "认证失败",
  "auth.error.magicLinkFailed": "魔法链接发送失败",
  "auth.error.updatePasswordFailed": "密码更新失败",
  "auth.error.signupDisabled": "此应用未公开开放，仅受邀用户可以登录。",

  "auth.email.label": "邮箱地址",
  "auth.email.placeholder": "name@example.com",
  "auth.password.label": "密码",
  "auth.password.forgot": "忘记密码？",
  "auth.password.useMagicLink": "改为邮箱链接登录",
  "auth.password.usePassword": "改用密码登录",
  "auth.password.new": "新密码",
  "auth.password.confirm": "确认密码",
  // 可见性切换 aria 标签使用的小写变体，与英文端逐字对应。
  "auth.password.newToggle": "新密码",
  "auth.password.confirmToggle": "确认密码",
  "auth.password.mismatch": "两次输入的密码不一致。",
  "auth.password.tooShort": (params: TranslationParams) =>
    `密码长度至少为 ${params.min} 个字符。`,
  "auth.password.breachWarning":
    "此密码曾出现在已知的数据泄露中。你仍可以使用它，但换一个更安全。",
  "auth.password.toggleVisibility": "密码",
  "auth.password.showLabel": "显示{label}",
  "auth.password.hideLabel": "隐藏{label}",

  "auth.action.signUp": "注册",
  "auth.action.signIn": "登录",
  "auth.action.signingUp": "注册中…",
  "auth.action.signingIn": "登录中…",
  "auth.action.continue": "继续",
  "auth.action.continuing": "继续中…",
  "auth.action.sendResetLink": "发送重置链接",
  "auth.action.sending": "发送中…",
  "auth.action.backToSignIn": "返回登录",
  "auth.action.signInInstead": "直接登录",
  "auth.action.retryEmail": "没有收到邮件？重试",
  "auth.action.updatePassword": "更新密码",
  "auth.action.updating": "更新中…",
  "auth.action.continueAsGuest": "以访客身份继续",
  "auth.action.orContinueWith": "或使用以下方式继续",

  "auth.confirm.checkInbox": "请查看收件箱",
  "auth.confirm.checkEmail": "请查看邮箱",
  "auth.confirm.signUpNewPrefix": "如果 ",
  "auth.confirm.signUpNewSuffix":
    " 是新邮箱，我们已发送链接供你完成账户设置。已有账户？直接登录。",
  "auth.confirm.magicLinkPrefix": "我们已向 ",
  "auth.confirm.magicLinkSuffix": " 发送了魔法链接，点击即可登录。",
  "auth.confirm.resetAccountPrefix": "如果 ",
  "auth.confirm.resetAccountSuffix": " 已注册，我们已发送密码重置链接。",
  "auth.confirm.resetNotRequestedPrefix": "不是你操作的？忽略该邮件，或",
  "auth.confirm.resetNotRequestedSuffix": "。",
  "auth.confirm.contactSupport": "联系支持",

  "auth.emailConfirmed.title": "邮箱已验证",
  "auth.emailConfirmed.description": "账户已准备就绪，登录后即可继续。",

  "auth.reset.linkExpiredTitle": "链接已失效",
  "auth.reset.linkExpiredDescription":
    "此密码重置链接无效或已过期。请在登录页重新申请。",
  "auth.reset.chooseNewPassword": "设置新密码",
  "auth.reset.updatedTitle": "密码已更新",
  "auth.reset.updatedDescription": "你现在可以使用新密码登录了。",

  "auth.legal.agree": "继续即表示你同意我们的",
  "auth.legal.terms": "服务条款",
  "auth.legal.and": "与",
  "auth.legal.privacy": "隐私政策",
  "auth.legal.guestNote": "。访客数据仅存储在本地，清除后将会丢失。",
} satisfies Record<string, DictionaryValue>;
