// Privilege comes only from a verified, authenticated account, never form data.
export function automaticSubmissionAccount(account:{email:string;email_verified_at:string|null}|null):boolean {
  return !!account?.email_verified_at && account.email.toLowerCase()==='lvyinchao@gmail.com';
}
