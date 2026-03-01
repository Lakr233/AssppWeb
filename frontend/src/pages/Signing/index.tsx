import { Navigate, Routes, Route } from 'react-router-dom';
import SigningLogin from './SigningLogin';
import SigningAccounts from './SigningAccounts';
import SigningIpa from './SigningIpa';
import { useSigningStore } from '../../stores/signingStore';

function SigningEntry() {
  const hasAccounts = useSigningStore((state) => state.accounts.length > 0);

  if (hasAccounts) {
    return <Navigate to="/signing/accounts" replace />;
  }

  return <Navigate to="/signing/login" replace />;
}

export default function Signing() {
  return (
    <Routes>
      <Route index element={<SigningEntry />} />
      <Route path="login" element={<SigningLogin />} />
      <Route path="accounts" element={<SigningAccounts />} />
      <Route path="sign" element={<SigningIpa />} />
      <Route path="*" element={<SigningEntry />} />
    </Routes>
  );
}
