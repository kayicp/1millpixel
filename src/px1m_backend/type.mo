import RBTree "../util/motoko/StableCollections/RedBlackTree/RBTree";
import Value "../util/motoko/Value";
import Error "../util/motoko/Error";
// import ICRC1T "../icrc1_canister/Types";
import Linker1 "linker1";

module {
  public type Plan = { credits : Nat; multiplier : Nat };
  public type Environment = {
    available : Bool;
    memo_size : { min : Nat; max : Nat };
    duration : {
      tx_window : Nat64;
      permitted_drift : Nat64;
    };
    canvas : { h : Nat; w : Nat };
    fee_collector : Principal;
    linker : Text;
    plans : [Plan];
    max_update_batch_size : Nat;
    max_query_batch_size : Nat;
    max_take_value : Nat;
    archive : {
      max_update_batch_size : Nat;
      root : ?Principal;
      standby : ?Principal;
      min_tcycles : Nat;
    };
  };
  public type User = RBTree.Type<(subaccount : Blob), Nat>;

  public type Xs = [var Nat8]; // 256 colors
  public type Ys = [Xs];

  public type ArgType = {
    #Commit : CommitArg;
    #Topup : TopupArg;
  };

  public type CommitArg = {
    subaccount : ?Blob;
    x : Nat;
    y : Nat;
    color : Nat8;
    memo : ?Blob;
    created_at : ?Nat64;
  };
  public type CommitErr = {
    #GenericError : Error.Type;
    #YTooLarge : { maximum_y : Nat };
    #XTooLarge : { maximum_x : Nat };
    #NoCredits;
    #CreatedInFuture : { time : Nat64 };
    #TooOld;
    #Duplicate : { of : Nat };
  };
  public type TopupArg = {
    subaccount : ?Blob;
    plan : Nat;

    fee : ?Nat;
    amount : ?Nat;
    memo : ?Blob;
    created_at : ?Nat64;
  };
  public type TopupErr = {
    #GenericError : Error.Type;
    #UnknownPlan;
    #BadFee : { expected_fee : Nat };
    #BadAmount : { expected_amount : Nat };
    #Unproxied;
    #Locked : { amount : Nat };
    #InsufficientBalance : { balance : Nat };
    #InsufficientAllowance : { allowance : Nat };
    #CreatedInFuture : { time : Nat64 };
    #TooOld;
    #Duplicate : { of : Nat };
    #TopupFailed : Linker1.WithdrawFromICRC1Err;
  };
};
