/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2016 Red Hat, Inc.
 *
 * Cockpit is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * Cockpit is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Cockpit; If not, see <http://www.gnu.org/licenses/>.
 */

import cockpit from "cockpit";
import React from "react";
import ReactDOM from "react-dom";
import PropTypes from "prop-types";
import { Alert, Button } from "@patternfly/react-core";
import { Modal } from 'patternfly-react';

import "page.scss";
import "cockpit-components-dialog.css";

const _ = cockpit.gettext;

/*
 * React template for a Cockpit dialog footer
 * It can display an error, wait for an action to complete,
 * has a 'Cancel' button and an action button (defaults to 'OK')
 * Expected props:
 *  - cancel_clicked optional
 *     Callback called when the dialog is canceled
 *  - cancel_caption optional, defaults to 'Cancel'
 *  - list of actions, each an object with:
 *      - clicked
 *         Callback function that is expected to return a promise.
 *         parameter: callback to set the progress text (will be displayed next to spinner)
 *      - caption optional, defaults to 'Ok'
 *      - disabled optional, defaults to false
 *      - style defaults to 'secondary', other options: 'primary', 'danger'
 *  - static_error optional, always show this error
 *  - idle_message optional, always show this message on the last row when idle
 *  - dialog_done optional, callback when dialog is finished (param true if success, false on cancel)
 */
export class DialogFooter extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            action_in_progress: false,
            action_in_progress_promise: null,
            action_progress_message: '',
            action_progress_cancel: null,
            action_canceled: false,
            error_message: null,
        };
        this.keyUpHandler = this.keyUpHandler.bind(this);
        this.update_progress = this.update_progress.bind(this);
        this.cancel_click = this.cancel_click.bind(this);
    }

    keyUpHandler(e) {
        if (e.keyCode == 27) {
            this.cancel_click();
            e.stopPropagation();
        }
    }

    componentDidMount() {
        document.body.classList.add("modal-in");
        document.addEventListener('keyup', this.keyUpHandler);
    }

    componentWillUnmount() {
        document.body.classList.remove("modal-in");
        document.removeEventListener('keyup', this.keyUpHandler);
    }

    update_progress(msg, cancel) {
        this.setState({ action_progress_message: msg, action_progress_cancel: cancel });
    }

    action_click(handler, e) {
        // only consider clicks with the primary button
        if (e && e.button !== 0)
            return;
        this.setState({
            error_message: null,
            action_progress_message: '',
            action_in_progress: true,
            action_canceled: false,
        });

        var p = handler(this.update_progress)
                .then(() => {
                    this.setState({ action_in_progress: false, error_message: null });
                    if (this.props.dialog_done)
                        this.props.dialog_done(true);
                })
                .catch(error => {
                    if (this.state.action_canceled) {
                        if (this.props.dialog_done)
                            this.props.dialog_done(false);
                    }

                    /* Always log global dialog errors for easier debugging */
                    if (error)
                        console.warn(error.message || error.toString());

                    this.setState({ action_in_progress: false, error_message: error });
                });

        if (p.progress)
            p.progress(this.update_progress);

        this.setState({ action_in_progress_promise: p });

        if (e)
            e.stopPropagation();
    }

    cancel_click(e) {
        // only consider clicks with the primary button
        if (e && e.button !== 0)
            return;

        this.setState({ action_canceled: true });

        if (this.props.cancel_clicked)
            this.props.cancel_clicked();

        // an action might be in progress, let that handler decide what to do if they added a cancel function
        if (this.state.action_in_progress && this.state.action_progress_cancel) {
            this.state.action_progress_cancel();
            return;
        }
        if (this.state.action_in_progress && 'cancel' in this.state.action_in_progress_promise) {
            this.state.action_in_progress_promise.cancel();
            return;
        }

        if (this.props.dialog_done)
            this.props.dialog_done(false);
        if (e)
            e.stopPropagation();
    }

    render() {
        var cancel_caption;
        if ('cancel_caption' in this.props)
            cancel_caption = this.props.cancel_caption;
        else
            cancel_caption = _("Cancel");

        // If an action is in progress, show the spinner with its message and disable all actions.
        // Cancel is only enabled when the action promise has a cancel method, or we get one
        // via the progress reporting.

        var wait_element;
        var actions_disabled;
        var cancel_disabled;
        if (this.state.action_in_progress) {
            actions_disabled = true;
            if (!(this.state.action_in_progress_promise && this.state.action_in_progress_promise.cancel) && !this.state.action_progress_cancel)
                cancel_disabled = true;
            wait_element = <div className="dialog-wait-ct pull-right">
                <span>{ this.state.action_progress_message }</span>
                <div className="spinner spinner-sm" />
            </div>;
        } else if (this.props.idle_message) {
            wait_element = <div className="dialog-wait-ct pull-right">
                { this.props.idle_message }
            </div>;
        }

        var action_buttons = this.props.actions.map(action => {
            let caption;
            if ('caption' in action)
                caption = action.caption;
            else
                caption = _("Ok");

            return (<Button
                key={ caption }
                className="apply"
                variant={ action.style || "secondary" }
                onClick={ this.action_click.bind(this, action.clicked) }
                isDisabled={ actions_disabled || ('disabled' in action && action.disabled) }
            >{ caption }</Button>
            );
        });

        // If we have an error message, display the error
        var error_element;
        var error_message;
        if (this.props.static_error !== undefined && this.props.static_error !== null)
            error_message = this.props.static_error;
        else
            error_message = this.state.error_message;
        if (error_message)
            error_element = <Alert variant='danger' isInline title={React.isValidElement(error_message) ? error_message : error_message.toString() } />;
        return (
            <Modal.Footer>
                { error_element }
                { this.props.extra_element }
                { action_buttons }
                <Button variant="link" className="cancel" onClick={this.cancel_click} isDisabled={cancel_disabled}>{ cancel_caption }</Button>
                { wait_element }
            </Modal.Footer>
        );
    }
}

DialogFooter.propTypes = {
    cancel_clicked: PropTypes.func,
    cancel_caption: PropTypes.string,
    actions: PropTypes.array.isRequired,
    static_error: PropTypes.string,
    dialog_done: PropTypes.func,
};

/*
 * React template for a Cockpit dialog
 * The primary action button is disabled while its action is in progress (waiting for promise)
 * Removes focus on other elements on showing
 * Expected props:
 *  - title (string)
 *  - body (react element, top element should be of class modal-body)
 *      It is recommended for information gathering dialogs to pass references
 *      to the input components to the controller. That way, the controller can
 *      extract all necessary information (e.g. for input validation) when an
 *      action is triggered.
 *  - footer (react element, top element should be of class modal-footer)
 *  - id optional, id that is assigned to the top level dialog node, but not the backdrop
 */
export class Dialog extends React.Component {
    componentDidMount() {
        // if we used a button to open this, make sure it's not focused anymore
        if (document.activeElement)
            document.activeElement.blur();
    }

    render() {
        return (
            <Modal id={this.props.id} show animation={false}>
                <Modal.Header>
                    <Modal.Title>{ this.props.title }</Modal.Title>
                </Modal.Header>
                { this.props.body }
                { this.props.footer }
            </Modal>
        );
    }
}
Dialog.propTypes = {
    // TODO: fix following by refactoring the logic showing modal dialog (recently show_modal_dialog())
    title: PropTypes.string, // is effectively required, but show_modal_dialog() provides initially no props and resets them later.
    body: PropTypes.element, // is effectively required, see above
    footer: PropTypes.element, // is effectively required, see above
    id: PropTypes.string
};

/* Create and show a dialog
 * For this, create a containing DOM node at the body level
 * The returned object has the following methods:
 *     - setFooterProps replace the current footerProps and render
 *     - setProps       replace the current props and render
 *     - render         render again using the stored props
 * The DOM node and React metadata are freed once the dialog has closed
 */
export function show_modal_dialog(props, footerProps) {
    var dialogName = 'cockpit_modal_dialog';
    // don't allow nested dialogs, just close whatever is open
    var curElement = document.getElementById(dialogName);
    if (curElement) {
        ReactDOM.unmountComponentAtNode(curElement);
        curElement.remove();
    }
    // create an element to render into
    var rootElement = document.createElement("div");
    rootElement.id = dialogName;
    document.body.appendChild(rootElement);

    // register our own on-close callback
    var origCallback;
    var closeCallback = function() {
        if (origCallback)
            origCallback.apply(this, arguments);
        ReactDOM.unmountComponentAtNode(rootElement);
        rootElement.remove();
    };

    var dialogObj = { };
    dialogObj.props = null;
    dialogObj.footerProps = null;
    dialogObj.render = function() {
        dialogObj.props.footer = <DialogFooter {...dialogObj.footerProps} />;
        // Don't render if we are no longer part of the document.
        // This would be mostly harmless except that it will remove
        // the input focus from whatever element has it, which is
        // unpleasant and also disrupts the tests.
        if (rootElement.offsetParent)
            ReactDOM.render(<Dialog {...dialogObj.props} />, rootElement);
    };
    function updateFooterAndRender() {
        if (dialogObj.props === null || dialogObj.props === undefined)
            dialogObj.props = { };
        dialogObj.props.footer = <DialogFooter {...dialogObj.footerProps} />;
        dialogObj.render();
    }
    dialogObj.setFooterProps = function(footerProps) {
        /* Always log error messages to console for easier debugging */
        if (footerProps.static_error)
            console.warn(footerProps.static_error);
        dialogObj.footerProps = footerProps;
        if (dialogObj.footerProps.dialog_done != closeCallback) {
            origCallback = dialogObj.footerProps.dialog_done;
            dialogObj.footerProps.dialog_done = closeCallback;
        }
        updateFooterAndRender();
    };
    dialogObj.setProps = function(props) {
        dialogObj.props = props;
        updateFooterAndRender();
    };
    dialogObj.setFooterProps(footerProps);
    dialogObj.setProps(props);

    // now actually render
    dialogObj.render();

    return dialogObj;
}
