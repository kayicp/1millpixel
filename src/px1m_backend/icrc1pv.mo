import Error "../util/motoko/Error";
import Result "../util/motoko/Result";
import ICRC1T "../icrc1_canister/Types";

module {
  public type Canister = actor {
    icrc1pv_token : shared query () -> async Principal;
    icrc1pv_withdraw_from : shared WithdrawFromArg -> async Result.Type<Nat, WithdrawFromErr>;
    icrc1pv_transfer_from : shared [TransferFromArg] -> async [Result.Type<Nat, TransferFromErr>];
  };
  public type TransferFromArg = {
    spender_subaccount : ?Blob;
    proxy : ICRC1T.Account;
    amount : Nat;
    to : ICRC1T.Account;
    fee : ?Nat;
    memo : ?Blob;
    created_at : ?Nat64;
  };
  public type TransferFromErr = {
    #GenericError : Error.Type;
    #InsufficientBalance : { balance : Nat };
    #InsufficientAllowance : { allowance : Nat };
    #BadFee : { expected_fee : Nat };
    #Proxied : { by : ICRC1T.Account };
    #Unproxied;
    #CreatedInFuture : { time : Nat64 };
    #TooOld;
    #Duplicate : { of : Nat };
  };
  public type WithdrawFromArg = {
    spender_subaccount : ?Blob;
    proxy : ICRC1T.Account;
    amount : Nat;
    to : ICRC1T.Account;
    fee : ?Nat;
    memo : ?Blob;
    created_at : ?Nat64;
  };
  public type WithdrawFromErr = {
    #GenericError : Error.Type;
    #InsufficientBalance : { balance : Nat };
    #InsufficientAllowance : { allowance : Nat };
    #BadFee : { expected_fee : Nat };
    #Unproxied;
    #Locked : { amount : Nat };
    #CreatedInFuture : { time : Nat64 };
    #TooOld;
    #Duplicate : { of : Nat };
    #TransferFailed : ICRC1T.TransferError;
  };

};
