define(['d3'], function(d3) {

	'use strict';

	function daphne(selector, options) {

		/*jshint validthis:true */
		this.el = document.querySelector(selector);
		this.options = options || {};

		if (this.el === null) {
			console.log("Could not find DOM object");
			return this;
		}

		// Build the DOM a bit
		this.el.className = 'daphne';
		this.header = document.createElement('div');
		this.header.className = 'sentence';
		this.el.appendChild(this.header);

		this.init();
		return this;
	}

	// Plugin Methods + Shared Properties
	daphne.prototype.defaults = {
		mode: 'edit',
		lang: 'grc',
		source: 'http://monicalent.com/daphne/demo/data.json', 	// For testing purposes, will be removed
		marginTop: 50,
		marginRight: 0,
		marginBottom: 50,
		marginLeft: 0,
		width: 400,
		height: 400,
		initialScale: 0.9,
		duration: 500
	};

	/**
	 * Initializes the plugin, combines user-set preferences with defaults.
	 */ 
	daphne.prototype.init = function() {

		this.config = this._extend({}, this.defaults, this.options);

		// Pass in a URL as data-source, or an array of word objects as a 'data' option
		if (!this.config.data) {
			this.el.addEventListener('populated', this.render.bind(this));
			this._fetchData();
		}
		else
			this.data = this._convertData(this.config.data);

		return this;
	};

	/**
	 * Utility method for merging two objects.
	 */ 
	daphne.prototype._extend = function(out) {
		out = out || {};

		for (var i = 1; i < arguments.length; i++) {
			if (!arguments[i])
				continue;

			for (var key in arguments[i]) {
				if (arguments[i].hasOwnProperty(key))
					out[key] = arguments[i][key];
			}
		}

		return out;
	};

	/** 
	 * Fetches whatever data we want to use to build the parse tree. 
	 */
	daphne.prototype._fetchData = function() {

		var request = new XMLHttpRequest();
		request.open('GET', this.config.source, true);

		request.onload = function() {
			if (request.status >= 200 && request.status < 400) {
				this.data = this._convertData(JSON.parse(request.responseText).words);

				// Tell our app that data has populated
				var ev;
				if (window.CustomEvent) 
					ev = new CustomEvent('populated');
				else {
					ev = document.createEvent('CustomEvent');
					ev.initEvent('populated', true, true);
				}
				this.el.dispatchEvent(ev);
			}
			else {
				console.log("Reached server but server error occured while trying to fetch data");
			}
		}.bind(this);

		request.onerror = function() {
			console.log("Connection error while trying to fetch data.");
		};

		request.send();
	};

	/** 
	 * Converts data from flat JSON into hierarchical JSON that d3 needs to build our tree. 
	 * Creates replicate copy of the data if the user is in 'edit' mode or 'play' mode.
	 * @param {object} words - Array of word objects.
	 */
	daphne.prototype._convertData = function(words) {

		var that = this;

		// Store our good, untouched-by-the-user data somewhere safe 
		this.answers = JSON.parse(JSON.stringify(words));

		var dataMap = words.reduce(function(map, node) {
			map[node.id] = node;
			return map;
		}, {});

		// Calc root node, and append it to our datasets 
		var rid = 0, node = {};
		for (var i = 0; i < words.length; i++) {
			node = words[i];
			if (dataMap[node.head] === undefined)
				break;	
		}

		var rootNode = { 'id': node.head, 'value': 'root', 'pos': 'root' };
		words.push(rootNode);
		dataMap[node.head] = rootNode;

		var treeData = [];
		words.forEach(function(node) {

			// If we're in 'play' mode, reset head property of all nodes to the root node
			var head = (that.config.mode == 'play' && node.pos != 'root') ? dataMap[rootNode.id] : dataMap[node.head];

			// Then, create the hierarchical data d3 needs
			if (head)
				(head.children || (head.children = [])).push(node);
			else
				treeData.push(node);
		});

		return treeData;
	};

	/**
	 * Uses the fetched data to render the parse tree, considering user options
	 */
	daphne.prototype.render = function(e) {
			
		var that = this;

		// Put the sentence as a whole into the header
		for (var i = 0; i < this.answers.length; i++) {
			var span = document.createElement('span'), space = document.createTextNode(' ');
			span.innerHTML = this.answers[i].value;
			span.setAttribute('data-id', this.answers[i].id);
			this.header.appendChild(span);
			this.header.appendChild(space);
		}

		// To keep multiple instances from stomping on each other's data/d3 references
		this.tree = d3.layout.tree().nodeSize([100, 50]);

		this.tree.separation(function(a, b) {
			var w1 = (a.value.length > a.relation.length) ? a.value.length : a.relation.length;
			var w2 = (b.value.length > b.relation.length) ? b.value.length : b.relation.length;

			var  scale = 0.13;

			return Math.ceil((w1 * scale) + (w2 * scale) / 2);
		});


		// TODO: Get tag names from conf file
		this.color = d3.scale.ordinal()
			.domain(["noun", "verb", "participle", "adj", "adverb", "particle", "conj", "prep", "pron", "numeral", "interjection", "exclam", "punct", "article", "root", "_", "unassigned"])
			.range(["#019292", "#D15241", "#8CD141", "#4E6087", "#8CD141", "#FF881A", "#754574", "#149069", "#523D5B", "#812F0F", "#F4BC78", "#F4BC78", "#1D78AA", "#257008", "#333", "#999", "#999"]);

		// Now we start working on the elements themselves
		this.svg = d3.select(this.el).append('svg')
			.attr('class', 'svg-container')
			.style('width', '100%')
			.style('overflow', 'auto');
		this.canvas = this.svg.append('g')
			.attr('class', 'canvas');
		this.canvas.append('g')
			.attr('transform', 'translate(' + 
				(that.config.width) + ', ' + 
				that.config.marginTop + ') scale(' + 
				that.config.initialScale + 
			')');

		// Bind zoom behavior to zoom function
		d3.select(this.el.querySelector('svg'))
			.call(d3.behavior.zoom()
				.scaleExtent([0.5, 5])
				.on("zoom", this._zoom.bind(this)))
			.on('dblclick.zoom', null);

		// And alas, the d3 update function
		this.root = this.data[0];
		this._update(this.root);
	};

	/**
	 * Zooming and scaling function for the parse tree's canvas. Gets attached to the SVG object at end of render function.
	 */
	daphne.prototype._zoom = function() {
		var scale = d3.event.scale,
			trans = d3.event.translate,
			tbound = -this.config.height * scale,
			bbound = this.config.height * scale,
			lbound = (-this.config.width + this.config.marginRight) * scale,
			rbound = (this.config.width + this.config.marginLeft) * scale;

		var translation = [
			Math.max(Math.min(trans[0], rbound), lbound),
			Math.max(Math.min(trans[1], bbound), tbound)
		];

		this.canvas.attr('transform', 'translate(' + translation + ') scale(' + scale + ')');
	};

	/**
	 * Update function is called every time the structure of the tree changes. It manages adjusting
	 * the positions of the nodes, their colors, displaying attirbutes and relations, etc.
	 * @param {object} source - the data used to construct the tree 
	 */
	daphne.prototype._update = function(source) {

		var that = this;

		var diagonal = d3.svg.diagonal().projection(function(d) {
			return [d.x, d.y];
		});

		var nodes = this.tree(this.root).reverse(),
			links = this.tree.links(nodes);

		nodes.forEach(function(d) {
			d.y = d.depth * 100;
		});

		var node = this.svg.select('.canvas g').selectAll('g.node')
			.data(nodes, function(d, i) {
				return d.id || (d.id = ++i);
			});

		var nodeEnter = node.enter().append('g')
			.attr('class', 'node')
			.attr('transform', function(d) {
				return 'translate(' + source.x + ', ' + source.y + ')';
			});

		nodeEnter.append('circle')
			.attr('r', 10)
			.on('click', function(d, i) {
				that._clickNode(d, i, d3.select(this));
			})
			.style('stroke', function(d) {
				return that.color(d.pos);
			});

		// Value of the Node
		nodeEnter.append('text')
			.attr('y', function(d, i) {
				return (d.pos == 'root') ? -30 : 15;
			})
			.attr('dy', '14px')
			.attr('lang', function(d, i) {
				return that.config.lang;
			})
			.attr('text-anchor', 'middle')
			.text(function(d) {
				return d.value;
			})
			.style('fill', function(d, i) {
				return (d.pos == 'root') ? '#CCC' : '#333';
			});

		// Relation of Node to Parent
		nodeEnter.append('text')
			.attr('y', function(d, i) {
				return (d.pos == 'root') ? 0 : -30;
			})
			.attr('dy', '12px')
			.attr('text-anchor', 'middle')
			.attr('class', 'label')
			.text(function(d) {
				return d.relation;
			});

		var nodeUpdate = node.transition()
			.duration(this.config.duration)
			.attr('transform', function(d) {
				return 'translate(' + d.x + ', ' + d.y + ')';
			});

		nodeUpdate.select('text.label')
			.text(function(d) {
				return d.relation;
			});

		nodeUpdate.select('circle')
			.style('stroke', function(d) {
				return that.color(d.pos);
			})
			.style('fill', function(d) {
				return '#FFF';
			});

		var link = this.svg.select('.canvas g').selectAll('path.link')
			.data(links, function(d) {
				return d.target.id;
			});

		link.enter().insert('path', 'g')
			.attr('class', 'link')
			.style('stroke', '#CCC')
			.style('stroke-width', '2px')
			.style('fill', 'none')
			.attr('d', function(d) {
				var o = { x: source.x, y: source.y };
				return diagonal({ source: o, target: o });
			});

		link.transition()
			.duration(this.config.duration)
			.attr('d', diagonal);

		nodes.forEach(function(d, i) {
			d.x0 = d.x;
			d.y0 = d.y;
		});
	};

	// TODO: Break down this click handler into much smaller parts...
	/**
	 * Click handler for a node. Decides whether to select, deselect, or move a node.
	 * @param {object} d - data of the clicked node
	 * @param {number} i - clicked node's index
	 * @param {object} node - reference to the d3 selection of the node
	 */
	daphne.prototype._clickNode = function(d, i, node) {

		// If the node was previously selected, then unselect it
		if (node.classed('selected')) {
			node.classed({ 'selected': false }); 
			this.el.querySelector('span[data-id="' + d.id + '"]').className = '';
			return;
		}
		else
			node.classed({ 'selected': true });

		// Highlight the word in the sentence
		this.el.querySelector('span[data-id="' + d.id + '"]').className = 'selected';

		// Otherwise, check to see if it's time to update links
		// Step 1: See if another node is also selected
		var selected = [];
		this.svg.selectAll('circle').each(function(d, i) {
			if (d3.select(this).classed('selected')) selected.push(d); 
		});

		// Step 2: If two nodes are selected, update links
		if (selected.length == 2) {
			var parent = d;
			var child = (parent.id != selected[0].id) ? selected[0] : selected[1];

			// Means: Child is already assigned to this parent, or they're trying to move the root
			if (parent.id == child.parent.id || child.pos == 'root') {
				this.svg.selectAll('circle').each(function(d, i) {
					d3.select(this).classed({ 'selected': false });
				});

				console.log("Child is already assigned to this parent, or you're trying to move the root.");
				// TODO: Display an error message to explain to user why their move was invalid
			}
			// Means: They're trying to make an ancestor the child of one of its descendants
			else if (this._isAncestor(child, parent.id)) {
				this.svg.selectAll('circle').each(function(d, i) {
					d3.select(this).classed({ 'selected': false });
				});

				console.log("Trying to make an ancestor the child of one of its descendants.");
				// TODO: Display an error message to explain to user why their move was invalid
			}
			// Means: They're legitimately moving a node
			else {

				console.log("valid move");

				// Add child to new parent, remove from former parent
				parent.children = this._insertChild(parent.children, child);
				child.parent.children = this._removeChild(child.parent.children, child);

				child.parent = parent;
				child.head = parent.id;
				this._update(parent);
				this._checkConnection(child);

				// Now, reset state of tree to unselected everything 
				this.svg.selectAll('circle').each(function(d, i) {
					d3.select(this).classed({ 'selected': false });
				});

			}

			setTimeout(function() {
				this.el.querySelector('span[data-id="' + parent.id + '"]').className = '';
				this.el.querySelector('span[data-id="' + child.id + '"]').className = '';
			}.bind(this), 500);
		}
	};

	/**
	 * In the parse tree, an ancestor cannot become the child of one of its descendants. 
	 * @param {object} child - the node that will move, so long as it's not an ancestor of its new parent.
	 * @param {object} parentId - the ID of the node that we want to ensure is not actually a descendant.
	 */
	daphne.prototype._isAncestor = function(child, parentId) {

		var children = child.children;
		if (children) {
			for (var i = 0, len = children.length; i < len; i++) {
				if (children[i].id == parentId)
					return true;
				else if (this._isAncestor(children[i], parentId))
					return true;
			}
		}

		return false;
	};

	/**
	 * Helper function for _clickNode -- splices a child node into an existing array of children at
	 * correct index based on sentence order.
	 * @param {array} children - children of the node.
	 * @param {object} child - child to insert into array of children.
	 */
	daphne.prototype._insertChild = function(children, child) {
		if (!children)
			children = [];

		var i = 0;
		for (i; i < children.length; i++) {
			if (children[i].id > child.id)
				break;
		}

		children.splice(i, 0, child);
		return children;
	};

	/**
	 * Helper function for _clickNode -- removes a child node from its parents list of children. 
	 * @param {array} children - children of the node.
	 * @param {object} child - child to insert into array of children.
	 */
	daphne.prototype._removeChild = function(children, child) {

		var i = 0;
		for (i; i < children.length; i++) {
			if (children[i].id == child.id)
				break;
		}
		children.splice(i, 1);
		return children;
	};

	/**
	 * Determine whether the child has been appended to the gold-standard-compliant parent.
	 * @param {object} child - the child node to check.
	 */
	daphne.prototype._checkConnection = function(child) {
		// TODO: Make this work
		for (var i = 0; i < this.answers; i++) {
			if (child.id == this.answers[i].id) {
				if (child.parent.id == this.answers[i].head)
					console.log("correct connection");
				else
					console.log("wrong answer");

				break;
			}
		}
	};

	// ------------------------- //
	// Utility Functions         //
	// ------------------------- //

	if (!Function.prototype.bind) {
		/**
		 * Implement bind() so that PhantomJS can test our code.
		 */
		Function.prototype.bind = function (oThis) {
			if (typeof this !== "function") {
				throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");
			}

			var aArgs = Array.prototype.slice.call(arguments, 1), 
				FToBind = this, 
				FNOP = function () {},
				FBound = function () {
					return FToBind.apply(this instanceof FNOP && oThis ? this : oThis,
						aArgs.concat(Array.prototype.slice.call(arguments)));
				};

			FNOP.prototype = this.prototype;
			FBound.prototype = new FNOP();

			return FBound;
		};
	}

	return daphne;

});
