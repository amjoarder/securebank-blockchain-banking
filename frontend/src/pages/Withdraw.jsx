import OperationForm from "../components/OperationForm";
import { RequireChain, RequireCustomer } from "../components/StatusGuards";
import { PageHeader } from "../components/ui";

export default function Withdraw() {
  return (
    <>
      <PageHeader title="Withdraw" description="Withdraw SBC credits from your account (cash-out)." />
      <RequireChain>
        <RequireCustomer>
          <OperationForm
            title="Withdrawal"
            description="Calls SecureBank.withdraw(amount)"
            actionLabel="Withdraw funds"
            balanceWarning
            submit={(contract, cents) => contract.withdraw(cents)}
            rules={
              <>
                <li>Caller must own an active account</li>
                <li>Amount &gt; 0 and ≤ 1,000,000.00 SBC</li>
                <li>Balance must cover the amount — otherwise the contract reverts with InsufficientBalance</li>
                <li>Recorded with an ID and emits Withdrawn</li>
              </>
            }
          />
        </RequireCustomer>
      </RequireChain>
    </>
  );
}
