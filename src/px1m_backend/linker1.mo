import Error "../util/motoko/Error";
import Result "../util/motoko/Result";
import ICRC1T "../icrc1_canister/Types";

module {
  public type Canister = actor {
    linker1_token : shared query () -> async Principal;
    linker1_withdraw_from : shared WithdrawFromArg -> async Result.Type<Nat, WithdrawFromICRC1Err>;
  };
  public type WithdrawFromArg = {
    to : ICRC1T.Account;
    fee : ?Nat;
    spender_subaccount : ?Blob;
    memo : ?Blob;
    created_at : ?Nat64;
    proxy : ICRC1T.Account;
    amount : Nat;
  };
  public type WithdrawFromICRC1Err = {
    #GenericError : Error.Type;
    #InsufficientAllowance : { allowance : Nat };
    #Duplicate : { of : Nat };
    #InsufficientBalance : { balance : Nat };
    #BadFee : { expected_fee : Nat };
    #Locked : { amount : Nat };
    #CreatedInFuture : { time : Nat64 };
    #Unproxied;
    #TooOld;
    #TransferFailed : ICRC1T.TransferError;
  };

};
