import React, { Component } from "react";
import FontAwesomeIcon from "@fortawesome/react-fontawesome";

import "./App.css";

import { css } from "glamor";

import Web3 from "web3";

import Emojify from "react-emojione";

const donationNetworkID = 1; // make sure donations only go through on this network.

const donationAddress = "0x055D0b8e377eb6977AA49A26FD3345209aF9E714"; //replace with the address to watch
const apiKey = "6DIUB7X6S92YJR6KXKF8V8ZU55IXT5PN2S"; //replace with your own key

const etherscanApiLink =
  "https://api.etherscan.io/api?module=account&action=txlist&address=" +
  donationAddress +
  "&startblock=0&endblock=99999999&sort=asc&apikey=" +
  apiKey;

const isSearched = searchTerm => item =>
  item.from.toLowerCase().includes(searchTerm.toLowerCase());

var myweb3;

var FontAwesome = require("react-fontawesome");

class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      ethlist: [],
      searchTerm: "",
      donateenabled: true,
      socketconnected: false,
      totalAmount: 0
    };
  }

  onSearchChange = event => {
    this.setState({
      searchTerm: event.target.value
    });
  };

  subscribe = address => {
    let ws = new WebSocket("wss://socket.etherscan.io/wshandler");

    function pinger(ws) {
      var timer = setInterval(function() {
        if (ws.readyState === 1) {
          ws.send(
            JSON.stringify({
              event: "ping"
            })
          );
        }
      }, 20000);
      return {
        stop: function() {
          clearInterval(timer);
        }
      };
    }

    ws.onopen = function() {
      this.setState({
        socketconnected: true
      });
      pinger(ws);
      ws.send(
        JSON.stringify({
          event: "txlist",
          address: address
        })
      );
    }.bind(this);
    ws.onmessage = function(evt) {
      let eventData = JSON.parse(evt.data);
      console.log(eventData);
      if (eventData.event === "txlist") {
        let newTransactionsArray = this.state.transactionsArray.concat(
          eventData.result
        );
        this.setState(
          {
            transactionsArray: newTransactionsArray
          },
          () => {
            this.processEthList(newTransactionsArray);
          }
        );
      }
    }.bind(this);
    ws.onerror = function(evt) {
      this.setState({
        socketerror: evt.message,
        socketconnected: false
      });
    }.bind(this);
    ws.onclose = function() {
      this.setState({
        socketerror: "socket closed",
        socketconnected: false
      });
    }.bind(this);
  };

  getAccountData = () => {
    return fetch(`${etherscanApiLink}`)
      .then(originalResponse => originalResponse.json())
      .then(responseJson => {
        return responseJson.result;
      });
  };

  handleDonate = event => {
    event.preventDefault();
    const form = event.target;
    let donateWei = new myweb3.utils.BN(
      myweb3.utils.toWei(form.elements["amount"].value, "ether")
    );
    let message = myweb3.utils.toHex(form.elements["message"].value);
    let extraGas = form.elements["message"].value.length * 68;

    myweb3.eth.net.getId().then(netId => {
      switch (netId) {
        case 1:
          console.log("Metamask is on mainnet");
          break;
        case 2:
          console.log("Metamask is on the deprecated Morden test network.");
          break;
        case 3:
          console.log("Metamask is on the ropsten test network.");
          break;
        case 4:
          console.log("Metamask is on the Rinkeby test network.");
          break;
        case 42:
          console.log("Metamask is on the Kovan test network.");
          break;
        default:
          console.log("Metamask is on an unknown network.");
      }
      if (netId === donationNetworkID) {
        return myweb3.eth.getAccounts().then(accounts => {
          return myweb3.eth
            .sendTransaction({
              from: accounts[0],
              to: donationAddress,
              value: donateWei,
              gas: 150000 + extraGas,
              data: message
            })
            .catch(e => {
              console.log(e);
            });
        });
      } else {
        console.log("no donation allowed on this network");
        this.setState({
          donateenabled: false
        });
      }
    });
  };

  processEthList = ethlist => {
    // let totalAmount = new myweb3.utils.BN(0);
    let filteredEthList = ethlist
      .map(obj => {
        obj.value = new myweb3.utils.BN(obj.value); // convert string to BigNumber
        return obj;
      })
      .filter(obj => {
        return obj.value.cmp(new myweb3.utils.BN(0));
      }) // filter out zero-value transactions
      .reduce((acc, cur) => {
        // group by address and sum tx value
        if (cur.isError !== "0") {
          // tx was not successful - skip it.
          return acc;
        }
        if (typeof acc[cur.from] === "undefined") {
          acc[cur.from] = {
            from: cur.from,
            value: new myweb3.utils.BN(0),
            input: cur.input,
            hash: []
          };
        }
        acc[cur.from].value = cur.value.add(acc[cur.from].value);
        acc[cur.from].input =
          cur.input !== "0x" && cur.input !== "0x00"
            ? cur.input
            : acc[cur.from].input;
        acc[cur.from].hash.push(cur.hash);
        return acc;
      }, {});
    filteredEthList = Object.keys(filteredEthList)
      .map(val => filteredEthList[val])
      .sort((a, b) => {
        // sort greatest to least
        return b.value.cmp(a.value);
      })
      .map((obj, index) => {
        // add rank
        obj.rank = index + 1;
        return obj;
      });
    const ethTotal = filteredEthList.reduce((acc, cur) => {
      return acc.add(cur.value);
    }, new myweb3.utils.BN(0));
    return this.setState({
      ethlist: filteredEthList,
      totalAmount: parseFloat(myweb3.utils.fromWei(ethTotal)).toFixed(2)
    });
  };

  componentDidMount = () => {
    if (
      typeof window.web3 !== "undefined" &&
      typeof window.web3.currentProvider !== "undefined"
    ) {
      myweb3 = new Web3(window.web3.currentProvider);
      myweb3.eth.defaultAccount = window.web3.eth.defaultAccount;
      this.setState({
        candonate: true
      });
    } else {
      // I cannot do transactions now.
      this.setState({
        candonate: false
      });
      myweb3 = new Web3();
    }

    this.getAccountData().then(res => {
      this.setState(
        {
          transactionsArray: res
        },
        () => {
          this.processEthList(res);
          this.subscribe(donationAddress);
        }
      );
    });
  };

  render = () => {
    const candonate = this.state.candonate;

    const responsiveness = css({
      "@media(max-width: 700px)": {
        "flex-wrap": "wrap"
      }
    });

    const hiddenOnMobile = css({
      "@media(max-width: 700px)": {
        display: "none"
      }
    });

    const responsiveOl = css({
      "@media (max-width: 1200px)": {
        "padding-left": "0.5rem",
        "padding-right": "0.5rem",
        "max-width": "100%"
      }
    });

    return (
      <div className="App container-fluid">
        <div
          {...responsiveness}
          className="flex-row d-flex justify-content-around"
        >
          <div className="flex-column introColumn">
            <img
              src="/img/eip0-logo.svg"
              className="typelogo img-fluid"
              alt="eip0 logo"
            />
            <div className="introContainer">
              <ol {...responsiveOl}>
                <li>
                  <div className="media">
                    <FontAwesomeIcon
                      icon="clipboard-list"
                      className="icon"
                      size="2x"
                      fixedWidth
                    />
                    <div className="margin-left">
                      The goal of this event is to discuss on-chain and
                      off-chain governance and ideally come to terms on
                      constituting an “EIP0” document a.k.a. a “first Etherean
                      constitution” stating values and principles that we all
                      agree on, hopefully going further and laying out a
                      decision-making process to address the philosophical side
                      of Ethereum ecosystem governance.{" "}
                      <a href="https://github.com/ethereum/EIPs">
                        The Ethereum Improvement Proposal
                      </a>
                    </div>
                  </div>
                </li>
                <li>
                  <div className="media">
                    <FontAwesomeIcon
                      icon="ticket-alt"
                      className="icon"
                      size="2x"
                      fixedWidth
                    />
                    <div className="margin-left">
                      The event is self funded, please signal your attendence by
                      submitting a {""}
                      <strong>minimum donation of 1 ETH</strong>.
                    </div>
                  </div>
                </li>
                <li>
                  <div className="media">
                    <FontAwesomeIcon
                      icon="envelope"
                      className="icon"
                      size="2x"
                      fixedWidth
                    />
                    <div className="margin-left">
                      This event is by invitation only! Thanks to the sponsors:
                      L4
                    </div>
                  </div>
                </li>
                <hr />
                <li>
                  <div className="media">
                    <FontAwesomeIcon
                      icon="clock"
                      className="icon"
                      size="2x"
                      fixedWidth
                    />
                    <div className="margin-left">
                      Mon, Apr 30 - Wed, May 2 (immediately preceding EdCon
                      2018)
                    </div>
                  </div>
                </li>
                <li>
                  <div className="media">
                    <FontAwesomeIcon
                      icon="map-marker"
                      className="icon"
                      size="2x"
                      fixedWidth
                    />
                    <div className="margin-left">Toronto, Canada.</div>
                  </div>
                </li>
              </ol>
            </div>

            <div {...responsiveness} className="flex-row d-flex amount">
              <div className="flex-column margin">
                <strong>Amount donated </strong>
                <h3>{this.state.totalAmount} ETH</h3>
              </div>
              <div className="flex-column margin">
                <form className="Search">
                  <input
                    type="text"
                    onChange={this.onSearchChange}
                    placeholder="filter leaderboard"
                  />
                </form>
              </div>
            </div>
          </div>

          <div className="flex-column donationColumn">
            <img
              src="/img/ways-to-donate.svg"
              className="typelogo img-fluid"
              alt=""
            />
            {candonate ? (
              <div>
                <h4 {...hiddenOnMobile}>
                  Publicly: Send a transaction via Metamask with your Team Name
                  as a message{" "}
                </h4>

                <form {...hiddenOnMobile} onSubmit={this.handleDonate}>
                  <input
                    type="text"
                    placeholder="ETH to donate"
                    name="amount"
                  />
                  <input type="text" placeholder="Message" name="message" />
                  <button className="btn btn-secondary">Send</button>
                </form>
              </div>
            ) : (
              <br />
            )}
            <hr />
            <h4>Privately: Send directly to the donation address</h4>
            <img
              src="/img/eip0-qr.svg"
              className="qr-code"
              alt="Donation QR Code"
            />
            <div className="word-wrap">
              <strong className="donation-address">{donationAddress}</strong>
            </div>
          </div>
        </div>

        <div className="flex-column leaderboard">
          <table className="table">
            <thead className="pagination-centered">
              <tr>
                <th>Rank</th>
                <th>Address</th>
                <th>Value</th>
                <th>Message</th>
                <th>Tx Link</th>
              </tr>
            </thead>
            <tbody>
              {this.state.ethlist
                .filter(isSearched(this.state.searchTerm))
                .map(item => (
                  <tr key={item.hash} className="Entry">
                    <td>{item.rank} </td>
                    <td>{item.from} </td>
                    <td>{myweb3.utils.fromWei(item.value)} ETH</td>
                    <td>
                      <Emojify>{myweb3.utils.hexToAscii(item.input)}</Emojify>
                    </td>
                    <td>
                      {item.hash.map((txHash, index) => (
                        <a
                          key={index}
                          href={"https://etherscan.io/tx/" + txHash}
                        >
                          [{index + 1}]
                        </a>
                      ))}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }; // End of render()
} // End of class App extends Component

export default App;
