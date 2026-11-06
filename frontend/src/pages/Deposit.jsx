import OperationForm from "../components/OperationForm";
import { RequireChain, RequireCustomer } from "../components/StatusGuards";
import { PageHeader } from "../components/ui";

export default function Deposit() {
  return (
    <>
      <PageHeader title="Deposit" description="Add simulated SBC credits to your account (cash-in at a branch)." />
      <RequireChain>
        <RequireCustomer>
          <OperationForm
            title="Deposit"
            description="Calls SecureBank.deposit(amount)"
            actionLabel="Deposit funds"
            submit={(contract, cents) => contract.deposit(cents)}
            rules={
              <>
                <li>Caller must be a registered customer</li>
                <li>Account must exist and be active</li>
                <li>Amount &gt; 0 and ≤ 1,000,000.00 SBC</li>
                <li>Recorded with an ID and emits Deposited</li>
              </>
            }
          />
        </RequireCustomer>
      </RequireChain>
    </>
  );
}
