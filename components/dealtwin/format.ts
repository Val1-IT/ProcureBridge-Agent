/** Display-only, lossless whole-rupiah formatting. Never computes eligibility or a cash balance. */
export function formatRupiah(value:string|null|undefined):string {
 if(value===null||value===undefined)return 'Not computed';
 if(!/^-?(0|[1-9][0-9]*)$/.test(value))return 'Invalid server amount';
 return 'Rp'+BigInt(value).toLocaleString('id-ID');
}
